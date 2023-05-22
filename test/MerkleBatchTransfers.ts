import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, Signer } from "ethers";
import { MerkleTree } from "merkletreejs";
import keccak256 from "keccak256";

describe("MerkleBatchTransfers", () => {
  let contract: Contract;
  let owner: Signer;
  let recipient1: Signer;
  let recipient2: Signer;
  let token: Contract;
  let merkleRoot: string;
  let leaves: Buffer[];
  let merkleTree: MerkleTree;
  let recipientsList: string[][];
  let amountsList: Number[][];

  before(async () => {
    [owner, recipient1, recipient2] = await ethers.getSigners();
    
    const ownerAddr = await owner.getAddress();
    const recipient1Addr = await recipient1.getAddress();
    const recipient2Addr = await recipient2.getAddress();

    const ZERO_ADDR = ethers.constants.AddressZero;

    recipientsList = [[ownerAddr, recipient1Addr, recipient2Addr], [recipient2Addr], [recipient1Addr], [ownerAddr, ZERO_ADDR], [ownerAddr]]
    amountsList = [[100, 200, 300], [300], [500], [500, 600], [0]]
    
    const leaf0 = encodeLeaf(recipientsList[0], amountsList[0]);
    const leaf1 = encodeLeaf(recipientsList[1], amountsList[1]);
    const leaf2 = encodeLeaf(recipientsList[2], amountsList[2]);
    const leaf3 = encodeLeaf(recipientsList[3], amountsList[3]);
    const leaf4 = encodeLeaf(recipientsList[4], amountsList[4]);

    leaves = [leaf0, leaf1, leaf2, leaf3, leaf4]

    merkleTree = new MerkleTree(leaves, keccak256, { hashLeaves: false, sortPairs: true });

    merkleRoot = merkleTree.getHexRoot();
  });

  beforeEach(async () => {
    const MyERC20 = await ethers.getContractFactory("MyERC20");
    token = await MyERC20.deploy(10);

    const MerkleBatchTransfers = await ethers.getContractFactory("MerkleBatchTransfers");
    contract = await MerkleBatchTransfers.deploy(token.address);
  });

  describe("constructor", () => {
    it("initializes the token address, and the root is 0x0", async () => {
      const ZERO_ADDR = "0x0000000000000000000000000000000000000000000000000000000000000000";
      expect(await contract.token()).to.equal(token.address);
      expect(await contract.merkleRoot()).to.equal(ZERO_ADDR);
    });
  });

  describe("submit", () => {
    context("when the sender is the owner", () => {
      it("sets the Merkle root", async () => {
        await contract.connect(owner).submit(merkleRoot);
        expect(await contract.merkleRoot()).to.equal(merkleRoot);
      });
    })

    context("when the sender is not the owner", () => {
      beforeEach('set sender', () => {
        contract = contract.connect(recipient1)
      })
    
      it("reverts", async () => {
        await expect(contract.connect(recipient1).submit(merkleRoot)).to.be.revertedWith("Ownable: caller is not the owner");
      });
    })
  });

  describe("batchTransfer", () => {
    context("when the proof is valid", () => {
      beforeEach('submit merkle root', async () => {
        await contract.submit(merkleRoot);
      })

      it("performs a batch of transfers", async () => {
        const recipients = recipientsList[0]; // [owner, recipient1, recipient2]
        const amounts = amountsList[0]; // [100, 200, 300]

        await token.connect(owner).approve(contract.address, 600);

        const proof = merkleTree.getHexProof(leaves[0]);

        await contract.batchTransfer(proof, recipients, amounts);

        const ownerBalance = await token.balanceOf(recipients[0]);
        const recipient1Balance = await token.balanceOf(recipients[1]);
        const recipient2Balance = await token.balanceOf(recipients[2]);

        expect(ownerBalance).to.equal(9999999999999999500n);
        expect(recipient1Balance).to.equal(200);
        expect(recipient2Balance).to.equal(300);
      });

      it("performs two batches of transfers", async () => {
        let recipients = recipientsList[0]; // [owner, recipient1, recipient2]
        let amounts = amountsList[0]; // [100, 200, 300]

        await token.connect(owner).approve(contract.address, 900);

        let proof = merkleTree.getHexProof(leaves[0]);

        await contract.batchTransfer(proof, recipients, amounts);

        recipients = recipientsList[1]; // [recipient2]
        amounts = amountsList[1]; // [300]

        proof = merkleTree.getHexProof(leaves[1]);

        await contract.batchTransfer(proof, recipients, amounts);

        const ownerBalance = await token.balanceOf(await owner.getAddress());
        const recipient1Balance = await token.balanceOf(await recipient1.getAddress());
        const recipient2Balance = await token.balanceOf(await recipient2.getAddress());

        expect(ownerBalance).to.equal(9999999999999999200n);
        expect(recipient1Balance).to.equal(200);
        expect(recipient2Balance).to.equal(600);
      });
      
      context("but there is insufficient allowance", () => {
        it("reverts", async () => {
          const recipients = recipientsList[0]; // [owner, recipient1, recipient2]
          const amounts = amountsList[0]; // [100, 200, 300]
          
          const proof = merkleTree.getHexProof(leaves[0]);
          
          await expect(contract.batchTransfer(proof, recipients, amounts)).to.be.revertedWith("ERC20: insufficient allowance");
        });
      });

      context("but an amount is zero", () => {
        it("reverts", async () => {
          const recipients = recipientsList[3];
          const amounts = amountsList[3];
  
          const proof = merkleTree.getHexProof(leaves[3]);
          await token.connect(owner).approve(contract.address, 600);
  
          await expect(contract.batchTransfer(proof, recipients, amounts)).to.be.revertedWith("MerkleBatchTransfers: address is zero");
        });
      });
  
      context("but an address is the zero address", () => {
        it("reverts", async () => {
          const recipients = recipientsList[4]; // [owner]
          const amounts = amountsList[4]; // [0]
  
          const proof = merkleTree.getHexProof(leaves[4]);
          await token.connect(owner).approve(contract.address, 600);
  
          await expect(contract.batchTransfer(proof, recipients, amounts)).to.be.revertedWith("MerkleBatchTransfers: amount is zero");
        });
      });
    });
      
    context("when the length of recipients and amounts are different", () => {
      it("reverts", async () => {
        const recipients = recipientsList[1]; // [recipient2]
        const amounts = amountsList[3]; // [500, 600]

        await contract.submit(merkleRoot);
        const proof = merkleTree.getHexProof(leaves[3]);

        await expect(contract.batchTransfer(proof, recipients, amounts)).to.be.revertedWith("MerkleBatchTransfers: recipients and amounts length mismatch");
      });
    });

    context("when it tries to use the same proof twice", () => {
      it("reverts", async () => {
        const recipients = recipientsList[0]; // [owner, recipient1, recipient2]
        const amounts = amountsList[0]; // [100, 200, 300]

        await contract.submit(merkleRoot);
        await token.connect(owner).approve(contract.address, 1200);
        const proof = merkleTree.getHexProof(leaves[0]);

        await contract.batchTransfer(proof, recipients, amounts);
        await expect(contract.batchTransfer(proof, recipients, amounts)).to.be.revertedWith("MerkleBatchTransfers: already transfered");
      });
    });

    context("when the root is not set", () => {
      it("reverts", async () => {
        const recipients = recipientsList[1]; // [recipient2]
        const amounts = amountsList[2]; // [500]

        const proof = merkleTree.getHexProof(leaves[2]);

        await expect(contract.batchTransfer(proof, recipients, amounts)).to.be.revertedWith("MerkleBatchTransfers: merkle root not set");
      });
    });

    context("when the proof is invalid", () => {
      beforeEach('submit merkle root', async () => {
        await contract.submit(merkleRoot);
      })

      it("reverts", async () => {
        const recipients = recipientsList[1]; // [recipient2]
        const amounts = amountsList[2]; // [500]

        const proof = merkleTree.getHexProof(leaves[2]);
        await token.connect(owner).approve(contract.address, 600);

        await expect(contract.batchTransfer(proof, recipients, amounts)).to.be.revertedWith("MerkleBatchTransfers: invalid proof");
      });

      it("reverts", async () => {
        const recipients = recipientsList[1]; // [recipient2]
        const amounts = amountsList[2]; // [500]

        const proof = merkleTree.getHexProof(leaves[1]);
        await token.connect(owner).approve(contract.address, 600);

        await expect(contract.batchTransfer(proof, recipients, amounts)).to.be.revertedWith("MerkleBatchTransfers: invalid proof");
      });

      it("reverts", async () => {
        const recipients = recipientsList[2]; // [recipient2]
        const amounts = amountsList[2]; // [500]

        const proof = merkleTree.getHexProof(leaves[1]);
        await token.connect(owner).approve(contract.address, 600);

        await expect(contract.batchTransfer(proof, recipients, amounts)).to.be.revertedWith("MerkleBatchTransfers: invalid proof");
      });
    });

    context("when the owner submits a new root", () => {
      beforeEach('submit merkle root', async () => {
        merkleTree = new MerkleTree(leaves, keccak256, { hashLeaves: false, sortPairs: true });
        merkleRoot = merkleTree.getHexRoot();

        await contract.submit(merkleRoot);
        await token.connect(owner).approve(contract.address, 1200);
        const proof = merkleTree.getHexProof(leaves[0]);

        await contract.batchTransfer(proof, recipientsList[0], amountsList[0]);
      })

      it("performs a new batch of transfers", async () => {
        const recipients = recipientsList[0]; // [owner, recipient1, recipient2]
        const newRecipients = [recipients[1], recipients[0], recipients[2]];
        const newAmounts = [200, 100, 300];
        const leaf = encodeLeaf(newRecipients, newAmounts);
        merkleTree.addLeaf(leaf);
        
        const newMerkleRoot = merkleTree.getHexRoot();
        await contract.submit(newMerkleRoot);
        const proof = merkleTree.getHexProof(leaf);

        await contract.batchTransfer(proof, newRecipients, newAmounts);

        const ownerBalance = await token.balanceOf(await owner.getAddress());
        const recipient1Balance = await token.balanceOf(await recipient1.getAddress());
        const recipient2Balance = await token.balanceOf(await recipient2.getAddress());

        expect(ownerBalance).to.equal(9999999999999999000n);
        expect(recipient1Balance).to.equal(400);
        expect(recipient2Balance).to.equal(600);
      });

      it("reverts if the batch was already executed", async () => {
        const recipients = recipientsList[0]; // [owner, recipient1, recipient2]
        const amounts = amountsList[0]; // [100, 200, 300]

        const newRecipients = [recipients[1], recipients[0], recipients[2]];
        const newAmounts = [200, 100, 300];
        const leaf = encodeLeaf(newRecipients, newAmounts);
        merkleTree.addLeaf(leaf);

        const newMerkleRoot = merkleTree.getHexRoot();
        await contract.submit(newMerkleRoot);
        const proof = merkleTree.getHexProof(leaves[0]);

        await expect(contract.batchTransfer(proof, recipients, amounts)).to.be.revertedWith("MerkleBatchTransfers: already transfered");
      });
    });
  });
});

function encodeLeaf(addresses: string[], amounts: Number[]): Buffer {
  return keccak256(ethers.utils.solidityPack(["address[]", "uint256[]"], [addresses, amounts]));
}