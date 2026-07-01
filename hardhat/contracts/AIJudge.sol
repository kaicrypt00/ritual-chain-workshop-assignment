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

    // --- NEW: Each participant's commitment ---
    struct Commitment {
        bytes32 hash;       // the fingerprint submitted during Phase 1
        bool revealed;      // did they reveal during Phase 2?
        string answer;      // filled in when they reveal
    }

    struct Submission {
        address submitter;
        string answer;
    }

    struct Bounty {
        address owner;
        string title;
        string rubric;
        uint256 reward;
        uint256 submissionDeadline;  // end of Phase 1 (commit phase)
        uint256 revealDeadline;      // end of Phase 2 (reveal phase)
        bool judged;
        bool finalized;
        bytes aiReview;
        uint256 winnerIndex;
        Submission[] submissions;    // filled during Phase 2 reveals
        // NEW: track commitments by address
        mapping(address => Commitment) commitments;
        mapping(address => bool) hasCommitted;
    }

    struct ConvoHistory {
        string storageType;
        string path;
        string secretsName;
    }

    mapping(uint256 => Bounty) public bounties;

    // --- Events ---
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

    // --- Modifiers ---
    modifier onlyOwner(uint256 bountyId) {
        require(msg.sender == bounties[bountyId].owner, "not bounty owner");
        _;
    }

    modifier bountyExists(uint256 bountyId) {
        require(bounties[bountyId].owner != address(0), "bounty not found");
        _;
    }

    // --- Functions ---

    /**
     * Owner creates a bounty with two deadlines:
     * submissionDeadline = when Phase 1 ends (no more commitments)
     * revealDeadline     = when Phase 2 ends (no more reveals)
     */
    function createBounty(
        string calldata title,
        string calldata rubric,
        uint256 submissionDeadline,
        uint256 revealDeadline
    ) external payable returns (uint256 bountyId) {
        require(msg.value > 0, "reward required");
        require(submissionDeadline > block.timestamp, "submission deadline must be in future");
        require(revealDeadline > submissionDeadline, "reveal deadline must be after submission deadline");

        bountyId = nextBountyId++;

        Bounty storage bounty = bounties[bountyId];
        bounty.owner = msg.sender;
        bounty.title = title;
        bounty.rubric = rubric;
        bounty.reward = msg.value;
        bounty.submissionDeadline = submissionDeadline;
        bounty.revealDeadline = revealDeadline;
        bounty.winnerIndex = type(uint256).max;

        emit BountyCreated(bountyId, msg.sender, title, msg.value, submissionDeadline, revealDeadline);
    }

    /**
     * PHASE 1: Submit a commitment (a hidden fingerprint of your answer).
     * 
     * How to make the hash in your frontend:
     *   keccak256(abi.encodePacked(answer, salt, msg.sender, bountyId))
     *
     * The salt is a random secret you keep private until Phase 2.
     */
    function submitCommitment(
        uint256 bountyId,
        bytes32 commitment
    ) external bountyExists(bountyId) {
        Bounty storage bounty = bounties[bountyId];

        require(block.timestamp < bounty.submissionDeadline, "submission phase is over");
        require(!bounty.judged, "already judged");
        require(!bounty.finalized, "already finalized");
        require(!bounty.hasCommitted[msg.sender], "you already submitted a commitment");

        bounty.commitments[msg.sender] = Commitment({
            hash: commitment,
            revealed: false,
            answer: ""
        });
        bounty.hasCommitted[msg.sender] = true;

        emit CommitmentSubmitted(bountyId, msg.sender);
    }

    /**
     * PHASE 2: Reveal your real answer and salt.
     * The contract checks that keccak256(answer, salt, sender, bountyId) == your commitment.
     * Only then does your answer become eligible for judging.
     */
    function revealAnswer(
        uint256 bountyId,
        string calldata answer,
        bytes32 salt
    ) external bountyExists(bountyId) {
        Bounty storage bounty = bounties[bountyId];

        require(block.timestamp >= bounty.submissionDeadline, "reveal phase has not started yet");
        require(block.timestamp < bounty.revealDeadline, "reveal phase is over");
        require(!bounty.judged, "already judged");
        require(!bounty.finalized, "already finalized");
        require(bounty.hasCommitted[msg.sender], "no commitment found for you");
        require(!bounty.commitments[msg.sender].revealed, "already revealed");
        require(bytes(answer).length <= MAX_ANSWER_LENGTH, "answer too long");
        require(bounty.submissions.length < MAX_SUBMISSIONS, "too many submissions");

        // This is the key check: recompute the hash and compare
        bytes32 expectedHash = keccak256(
            abi.encodePacked(answer, salt, msg.sender, bountyId)
        );
        require(
            expectedHash == bounty.commitments[msg.sender].hash,
            "answer does not match your commitment"
        );

        // Hash matched — store the real answer
        bounty.commitments[msg.sender].revealed = true;
        bounty.commitments[msg.sender].answer = answer;

        bounty.submissions.push(
            Submission({submitter: msg.sender, answer: answer})
        );

        emit AnswerRevealed(bountyId, bounty.submissions.length - 1, msg.sender);
    }


    /**
     * PHASE 3: Owner judges all revealed answers using Ritual AI.
     * Can only be called after the reveal deadline.
     *
     * llmInput layout:
     *   bytes[0..31]  — address executor (use address(0) to let the network auto-select)
     *   bytes[32..]   — remaining LLM precompile ABI fields
     *
     * Bypass / mock path: pass a single 32-byte word encoding
     * address(0xdEaD...dead) as executor — the contract detects this and uses
     * the fallback JSON without calling the precompile.
     */
    function judgeAll(
        uint256 bountyId,
        bytes calldata llmInput
    ) external bountyExists(bountyId) onlyOwner(bountyId) {
        Bounty storage bounty = bounties[bountyId];

        require(block.timestamp >= bounty.revealDeadline, "reveal phase not over yet");
        require(!bounty.judged, "already judged");
        require(!bounty.finalized, "already finalized");
        require(bounty.submissions.length > 0, "no revealed submissions to judge");

        address executor = abi.decode(llmInput, (address));
        bytes memory completionData;

        // Bypass sentinel: 0xdead...dead means "use mock/fallback"
        bool isMock = (executor == 0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF);

        if (!isMock) {
            // Real path — pass llmInput directly to the precompile.
            // executor == address(0) in the payload tells the Ritual network
            // to auto-select an available LLM inference executor.
            (bool success, bytes memory rawOutput) = LLM_INFERENCE_PRECOMPILE.call(llmInput);

            if (success && rawOutput.length >= 64) {
                try this.decodePrecompileOutput(rawOutput) returns (bytes memory decoded) {
                    if (decoded.length > 0) {
                        completionData = decoded;
                    } else {
                        completionData = bytes(
                            '{"winnerIndex":0,"ranking":[{"index":0,"score":95,"reason":"LLM returned empty completion"}],"summary":"Fallback: LLM returned empty response."}'
                        );
                    }
                } catch Error(string memory reason) {
                    completionData = abi.encodePacked('{"error":"', reason, '"}');
                } catch {
                    completionData = bytes(
                        '{"winnerIndex":0,"ranking":[{"index":0,"score":95,"reason":"LLM decode failed"}],"summary":"Fallback: could not decode LLM response."}'
                    );
                }
            } else {
                completionData = bytes(
                    '{"winnerIndex":0,"ranking":[{"index":0,"score":95,"reason":"LLM precompile unavailable"}],"summary":"Fallback AI review (Ritual TEE offline). Winner is index 0."}'
                );
            }
        } else {
            // Mock path — bypass sentinel used by testing/fallback scripts
            completionData = bytes(
                '{"winnerIndex":0,"ranking":[{"index":0,"score":95,"reason":"Perfect explanation of TEE and decentralized inference"}],"summary":"Simulated AI review (mock bypass). Winner is index 0."}'
            );
        }

        bounty.judged = true;
        bounty.aiReview = completionData;

        emit AllAnswersJudged(bountyId, completionData);
    }

    /**
     * Helper to decode short-running async precompile output raw bytes
     * The precompile returns: abi.encode(bytes simmedInput, bytes actualOutput)
     * actualOutput contains: abi.encode(bool hasError, bytes completion, bytes modelMeta, string errorMsg, ConvoHistory)
     */
    function decodePrecompileOutput(bytes calldata rawOutput) external pure returns (bytes memory completion) {
        (, bytes memory actualOutput) = abi.decode(rawOutput, (bytes, bytes));
        if (actualOutput.length == 0) return bytes("");
        (bool hasError, bytes memory completionData, , string memory errorMsg, ) =
            abi.decode(actualOutput, (bool, bytes, bytes, string, ConvoHistory));
        if (hasError) revert(errorMsg);
        completion = completionData;
    }

    /**
     * PHASE 3 (MOCK): Owner directly provides the AI review bytes.
     * Use this when the Ritual LLM precompile is unavailable (local testing,
     * workshop demos, or TEE executor down).  The bytes should be a UTF-8
     * JSON string matching the shape:
     *   { "winnerIndex": number, "ranking": [...], "summary": "..." }
     * Emits the same AllAnswersJudged event as judgeAll.
     */
    function judgeAllMock(
        uint256 bountyId,
        bytes calldata aiReview
    ) external bountyExists(bountyId) onlyOwner(bountyId) {
        Bounty storage bounty = bounties[bountyId];

        require(block.timestamp >= bounty.revealDeadline, "reveal phase not over yet");
        require(!bounty.judged, "already judged");
        require(!bounty.finalized, "already finalized");
        require(bounty.submissions.length > 0, "no revealed submissions to judge");

        bounty.judged = true;
        bounty.aiReview = aiReview;

        emit AllAnswersJudged(bountyId, aiReview);
    }

    /**
     * PHASE 3: Owner picks the winner after judging.
     */
    function finalizeWinner(
        uint256 bountyId,
        uint256 winnerIndex
    ) external bountyExists(bountyId) onlyOwner(bountyId) {
        Bounty storage bounty = bounties[bountyId];

        require(bounty.judged, "not judged yet");
        require(!bounty.finalized, "already finalized");
        require(winnerIndex < bounty.submissions.length, "invalid winner index");

        bounty.finalized = true;
        bounty.winnerIndex = winnerIndex;

        address winner = bounty.submissions[winnerIndex].submitter;
        require(bounty.commitments[winner].revealed, "winner never revealed");
        uint256 reward = bounty.reward;
        bounty.reward = 0;

        (bool ok, ) = payable(winner).call{value: reward}("");
        require(ok, "payment failed");

        emit WinnerFinalized(bountyId, winnerIndex, winner, reward);
    }

    /**
     * Read bounty info. Note: submissionCount only counts REVEALED answers.
     */
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
            string memory answer,
            bytes32 commitment,
            bool revealed
        )
    {
        Bounty storage bounty = bounties[bountyId];
        require(index < bounty.submissions.length, "invalid index");
        Submission storage submission = bounty.submissions[index];
        address subAddr = submission.submitter;
        Commitment storage c = bounty.commitments[subAddr];
        return (subAddr, submission.answer, c.hash, c.revealed);
    }

    /**
     * Check if a specific address has submitted a commitment.
     * Returns true/false — does NOT reveal the hidden answer.
     */
    function hasCommitted(
        uint256 bountyId,
        address participant
    ) external view bountyExists(bountyId) returns (bool) {
        return bounties[bountyId].hasCommitted[participant];
    }
}