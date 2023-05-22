// SPDX-License-Identifier: MIT
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

pragma solidity ^0.8.18;

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/utils/cryptography/MerkleProof.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

/**
 * @title MerkleBatchTransfers
 * @dev A contract that allows batch transfers of ERC20 tokens based on a Merkle proof.
 */
contract MerkleBatchTransfers is Ownable {
    IERC20 public token;
    bytes32 public merkleRoot;

    mapping(bytes32 => bool) public wasTransfered;

    /**
     * @dev Constructor function.
     * @param _token Address of the ERC20 token associated with the contract.
     */
    constructor(address _token) {
        token = IERC20(_token);
    }

    /**
     * @dev Submits the the Merkle root to the contract.
     * @param _merkleRoot The Merkle root hash of the tree containing the recipient addresses and amounts.
     */
    function submit(bytes32 _merkleRoot) onlyOwner external {
        merkleRoot = _merkleRoot;
    }

    /**
     * @dev Performs batch transfers based on the Merkle proof.
     * @param merkleProof Array of Merkle proofs for the recipient addresses and amounts.
     * @param recipients Array of recipient addresses.
     * @param amounts Array of corresponding transfer amounts.
     */
    function batchTransfer(bytes32[] calldata merkleProof, address[] calldata recipients, uint256[] calldata amounts) external {
        require(recipients.length == amounts.length, "MerkleBatchTransfers: recipients and amounts length mismatch");
        require(merkleRoot != 0x0, "MerkleBatchTransfers: merkle root not set");

        bytes32 leaf = keccak256(abi.encodePacked(recipients, amounts));
        require(!wasTransfered[leaf], "MerkleBatchTransfers: already transfered");

        bool isValidProof = MerkleProof.verifyCalldata(merkleProof, merkleRoot, leaf);
        require(isValidProof, "MerkleBatchTransfers: invalid proof");

        wasTransfered[leaf] = true;

        uint256 amount;
        uint256 length = recipients.length;
        for (uint256 i = 0; i < length; i++) {
            amount = amounts[i];
            require(amount > 0, "MerkleBatchTransfers: amount is zero");
            SafeERC20.safeTransferFrom(token, owner(), recipients[i], amount);
        }
    } 
}