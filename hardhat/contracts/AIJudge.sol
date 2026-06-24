// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PrecompileConsumer} from "./utils/PrecompileConsumer.sol";

interface IRitualWallet {
    function deposit(uint256 lockDuration) external payable;

    function depositFor(address user, uint256 lockDuration) external payable;

    function withdraw(uint256 amount) external;

    function balanceOf(address) external view returns (uint256);

    function lockUntil(address) external view returns (uint256);
}

contract AIJudge is PrecompileConsumer {
    uint256 public constant MAX_SUBMISSIONS = 10;
    uint256 public constant MAX_ANSWER_LENGTH = 2_000;

    uint256 public nextBountyId = 1;

    IRitualWallet wallet =
        IRitualWallet(0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948);

    // A submission now starts as just a "fingerprint" (commitment).
    // The real answer text is empty until the participant reveals it.
    struct Submission {
        address submitter;
        bytes32 commitment;
        bool revealed;
        string answer;
    }

    struct Bounty {
        address owner;
        string title;
        string rubric;
        uint256 reward;
        uint256 submissionDeadline; // commitments allowed before this
        uint256 revealDeadline; // reveals allowed before this (and after submissionDeadline)
        bool judged;
        bool finalized;
        bytes aiReview;
        uint256 winnerIndex;
        Submission[] submissions;
    }

    struct ConvoHistory {
        string storageType;
        string path;
        string secretsName;
    }

    mapping(uint256 => Bounty) public bounties;

    // Tracks whether an address has already committed to a given bounty,
    // and which submission slot belongs to them (so reveal() knows where to look).
    mapping(uint256 => mapping(address => bool)) public hasCommitted;
    mapping(uint256 => mapping(address => uint256)) public submissionIndexOf;

    event BountyCreated(
        uint256 indexed bountyId,
        address indexed owner,
        string title,
        uint256 reward,
        uint256 submissionDeadline,
        uint256 revealDeadline
    );

    event CommitmentSubmitted(
        uint256 indexed bountyId,
        uint256 indexed submissionIndex,
        address indexed submitter
    );

    event AnswerRevealed(
        uint256 indexed bountyId,
        uint256 indexed submissionIndex,
        address indexed submitter
    );

    event AllAnswersJudged(uint256 indexed bountyId, bytes aiReview);

    event WinnerFinalized(
        uint256 indexed bountyId,
        uint256 indexed winnerIndex,
        address indexed winner,
        uint256 reward
    );

    modifier onlyOwner(uint256 bountyId) {
        require(msg.sender == bounties[bountyId].owner, "not bounty owner");
        _;
    }

    modifier bountyExists(uint256 bountyId) {
        require(bounties[bountyId].owner != address(0), "bounty not found");
        _;
    }

    function createBounty(
        string calldata title,
        string calldata rubric,
        uint256 submissionDeadline,
        uint256 revealDeadline
    ) external payable returns (uint256 bountyId) {
        require(msg.value > 0, "reward required");
        require(
            submissionDeadline > block.timestamp,
            "submission deadline must be in the future"
        );
        require(
            revealDeadline > submissionDeadline,
            "reveal deadline must be after submission deadline"
        );

        bountyId = nextBountyId++;

        Bounty storage bounty = bounties[bountyId];

        bounty.owner = msg.sender;
        bounty.title = title;
        bounty.rubric = rubric;
        bounty.reward = msg.value;
        bounty.submissionDeadline = submissionDeadline;
        bounty.revealDeadline = revealDeadline;
        bounty.winnerIndex = type(uint256).max;

        emit BountyCreated(
            bountyId,
            msg.sender,
            title,
            msg.value,
            submissionDeadline,
            revealDeadline
        );
    }

    /// @notice Step 1: submit only a fingerprint of your answer.
    /// commitment must equal keccak256(abi.encodePacked(answer, salt, msg.sender, bountyId))
    function submitCommitment(
        uint256 bountyId,
        bytes32 commitment
    ) external bountyExists(bountyId) {
        Bounty storage bounty = bounties[bountyId];

        require(
            block.timestamp < bounty.submissionDeadline,
            "submission window closed"
        );
        require(commitment != bytes32(0), "commitment required");
        require(!hasCommitted[bountyId][msg.sender], "already committed");
        require(
            bounty.submissions.length < MAX_SUBMISSIONS,
            "too many submissions"
        );

        uint256 index = bounty.submissions.length;

        bounty.submissions.push(
            Submission({
                submitter: msg.sender,
                commitment: commitment,
                revealed: false,
                answer: ""
            })
        );

        hasCommitted[bountyId][msg.sender] = true;
        submissionIndexOf[bountyId][msg.sender] = index;

        emit CommitmentSubmitted(bountyId, index, msg.sender);
    }

    /// @notice Step 2: reveal your real answer + salt. Must match your earlier commitment.
    function revealAnswer(
        uint256 bountyId,
        string calldata answer,
        bytes32 salt
    ) external bountyExists(bountyId) {
        Bounty storage bounty = bounties[bountyId];

        require(
            block.timestamp >= bounty.submissionDeadline,
            "submission window still open"
        );
        require(
            block.timestamp < bounty.revealDeadline,
            "reveal window closed"
        );
        require(hasCommitted[bountyId][msg.sender], "no commitment found");
        require(bytes(answer).length <= MAX_ANSWER_LENGTH, "answer too long");

        uint256 index = submissionIndexOf[bountyId][msg.sender];
        Submission storage submission = bounty.submissions[index];

        require(!submission.revealed, "already revealed");

        bytes32 check = keccak256(
            abi.encodePacked(answer, salt, msg.sender, bountyId)
        );
        require(check == submission.commitment, "reveal does not match commitment");

        submission.revealed = true;
        submission.answer = answer;

        emit AnswerRevealed(bountyId, index, msg.sender);
    }

    function judgeAll(
        uint256 bountyId,
        bytes calldata llmInput
    ) external bountyExists(bountyId) onlyOwner(bountyId) {
        Bounty storage bounty = bounties[bountyId];

        require(
            block.timestamp >= bounty.revealDeadline,
            "reveal window still open"
        );
        require(!bounty.judged, "already judged");
        require(!bounty.finalized, "already finalized");

        uint256 revealedCount = 0;
        for (uint256 i = 0; i < bounty.submissions.length; i++) {
            if (bounty.submissions[i].revealed) {
                revealedCount++;
            }
        }
        require(revealedCount > 0, "no revealed submissions");

        bytes memory output = _executePrecompile(
            LLM_INFERENCE_PRECOMPILE,
            llmInput
        );

        (
            bool hasError,
            bytes memory completionData,
            ,
            string memory errorMessage,

        ) = abi.decode(output, (bool, bytes, bytes, string, ConvoHistory));

        require(!hasError, errorMessage);

        bounty.judged = true;
        bounty.aiReview = completionData;

        emit AllAnswersJudged(bountyId, completionData);
    }

    function finalizeWinner(
        uint256 bountyId,
        uint256 winnerIndex
    ) external bountyExists(bountyId) onlyOwner(bountyId) {
        Bounty storage bounty = bounties[bountyId];

        require(bounty.judged, "not judged yet");
        require(!bounty.finalized, "already finalized");
        require(winnerIndex < bounty.submissions.length, "invalid index");
        require(
            bounty.submissions[winnerIndex].revealed,
            "winner must have revealed"
        );

        bounty.finalized = true;
        bounty.winnerIndex = winnerIndex;

        address winner = bounty.submissions[winnerIndex].submitter;
        uint256 reward = bounty.reward;
        bounty.reward = 0;

        (bool ok, ) = payable(winner).call{value: reward}("");
        require(ok, "payment failed");

        emit WinnerFinalized(bountyId, winnerIndex, winner, reward);
    }

    function getBounty(
        uint256 bountyId
    )
        external
        view
        bountyExists(bountyId)
        returns (
            address owner,
            string memory title,
            string memory rubric,
            uint256 reward,
            uint256 submissionDeadline,
            uint256 revealDeadline,
            bool judged,
            bool finalized,
            uint256 submissionCount,
            uint256 winnerIndex,
            bytes memory aiReview
        )
    {
        Bounty storage bounty = bounties[bountyId];

        return (
            bounty.owner,
            bounty.title,
            bounty.rubric,
            bounty.reward,
            bounty.submissionDeadline,
            bounty.revealDeadline,
            bounty.judged,
            bounty.finalized,
            bounty.submissions.length,
            bounty.winnerIndex,
            bounty.aiReview
        );
    }

    function getSubmission(
        uint256 bountyId,
        uint256 index
    )
        external
        view
        bountyExists(bountyId)
        returns (
            address submitter,
            bytes32 commitment,
            bool revealed,
            string memory answer
        )
    {
        Bounty storage bounty = bounties[bountyId];

        require(index < bounty.submissions.length, "invalid index");

        Submission storage submission = bounty.submissions[index];

        return (
            submission.submitter,
            submission.commitment,
            submission.revealed,
            submission.answer
        );
    }
}
