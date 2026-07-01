The commit-reveal method hides answers by having 
participants submit only a fingerprint (hash) of 
their answer during the submission window. Nobody 
can read a hash backwards into the real answer. 
After the submission deadline, participants reveal 
their real answer and a secret word they chose. 
The contract checks the fingerprint matches before 
accepting the reveal. Only after the reveal window 
closes does the AI judge all revealed answers 
together in one batch request. The weakness is 
that answers become public briefly during the 
reveal phase before judging completes.

The Ritual-native TEE method is more powerful. 
Participants encrypt their answer using Ritual's 
key system so only Ritual's secure hardware 
environment (TEE) can decrypt it. The encrypted 
answer is stored on-chain but is unreadable 
gibberish to everyone including the contract 
owner. During judging, the TEE decrypts all 
answers privately inside its secure environment, 
sends them to the LLM in one batch, and only 
the result comes back out. The real answers are 
never visible on the public chain at any point. 
This approach requires Ritual's specific chain 
features and cannot run on a generic EVM network.
