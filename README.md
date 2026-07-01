# Ritual AI Bounty Judge — Commit-Reveal Lifecycle

This project implements a privacy-preserving smart contract-based bounty system on the Ritual Chain. To prevent participants from copying each other's answers, the bounty uses a commit-reveal process combined with on-chain AI evaluation.

## Full Lifecycle Flow

1. **Bounty Creation**: The owner creates a bounty specifying the reward amount, title, rubric, a **Submission Deadline**, and a **Reveal Deadline**.
2. **Commit Phase**: 
   * Active until the **Submission Deadline** is reached.
   * Participants write their answers locally. 
   * The frontend generates a secret, random `salt` and hashes the answer along with the salt, the participant's address, and the bounty ID: `keccak256(abi.encodePacked(answer, salt, msg.sender, bountyId))`.
   * Only this hash (fingerprint) is submitted to the contract. The real answer remains completely hidden.
   * The salt and answer are backed up in the user's browser `localStorage`.
3. **Submission Deadline**: The submission window closes. No new commitments are accepted.
4. **Reveal Phase**:
   * Active between the **Submission Deadline** and the **Reveal Deadline**.
   * Participants load their saved answer and secret salt from `localStorage` (or input them manually) and call `revealAnswer` on the contract.
   * The contract re-hashes the answer and salt on-chain and verifies that the fingerprint matches the committed hash.
   * If it matches, the answer is unlocked and added to the eligible submissions pool.
5. **Reveal Deadline**: The reveal window closes. No more answers can be revealed.
6. **AI Judging**:
   * The bounty owner triggers `judgeAll`.
   * The contract gathers all successfully revealed answers and makes a batch call to the Ritual native LLM precompile.
   * The AI reviews all answers concurrently against the rubric, assigns scores, and writes back the ranking and recommendation to the contract.
7. **Finalize Winner**:
   * The owner reviews the AI's recommendation and calls `finalizeWinner` to select the winning index.
   * Only participants who successfully completed the reveal phase can be selected.
8. **Reward Payout**: The contract automatically transfers the locked reward funds directly to the winner's wallet address, finalizing the bounty.
