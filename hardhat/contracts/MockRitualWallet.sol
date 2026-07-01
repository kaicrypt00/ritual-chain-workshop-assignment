// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockRitualWallet {
    mapping(address => uint256) public balanceOf;
    mapping(address => uint256) public lockUntil;

    function deposit(uint256 lockDuration) external payable {
        balanceOf[msg.sender] += msg.value;
        lockUntil[msg.sender] = block.timestamp + lockDuration;
    }

    function depositFor(address user, uint256 lockDuration) external payable {
        balanceOf[user] += msg.value;
        lockUntil[user] = block.timestamp + lockDuration;
    }

    function withdraw(uint256 amount) external {
        require(balanceOf[msg.sender] >= amount, "insufficient balance");
        balanceOf[msg.sender] -= amount;
        payable(msg.sender).transfer(amount);
    }
}
