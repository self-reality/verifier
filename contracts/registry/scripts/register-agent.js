require('dotenv').config();

// Registers the anchor worker's agent registration file on the ERC-8004 IdentityRegistry,
// which has the same address on every mainnet. Without SEND=1 it only simulates.
//
//   DEPLOYER_WALLET=1 SEND=1 pnpm hardhat run scripts/register-agent.js --network base
//
// Put the printed id into the worker's AGENT_REGISTRATIONS variable afterwards.
const IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const AGENT_URI = process.env.AGENT_URI || 'https://anchor.akashi-notari.com/.well-known/agent-registration.json';
const ABI = [
  'function register(string agentURI) returns (uint256 agentId)',
  'function tokenURI(uint256) view returns (string)',
  'function ownerOf(uint256) view returns (address)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
];

async function main() {
  let signer;
  if (process.env.DEPLOYER_WALLET) {
    const { connect } = require('deployer-wallet');
    signer = await connect({ provider: ethers.provider });
  } else {
    [signer] = await ethers.getSigners();
  }
  if (!signer) throw new Error('No credentials found. Set DEPLOYER_WALLET=1 or DEPLOYER_KEY');

  const { chainId } = await ethers.provider.getNetwork();
  const registry = new ethers.Contract(IDENTITY_REGISTRY, ABI, signer);
  console.log('Registering', AGENT_URI, 'from', signer.address, `on chain ${chainId}`);
  console.log('Simulated agent id:', (await registry.register.staticCall(AGENT_URI)).toString());
  if (!process.env.SEND) {
    console.log('Nothing sent. Set SEND=1 to register.');
    return;
  }

  const tx = await registry.register(AGENT_URI);
  const receipt = await tx.wait();
  const minted = receipt.logs
    .filter((log) => log.address.toLowerCase() === IDENTITY_REGISTRY.toLowerCase())
    .map((log) => registry.interface.parseLog(log))
    .find((event) => event && event.name === 'Transfer');
  const agentId = minted.args.tokenId;
  console.log('✅ Registered: agent id', agentId.toString(), `(tx ${tx.hash})`);
  try {
    console.log('Owner:', await registry.ownerOf(agentId), '· URI:', await registry.tokenURI(agentId));
  } catch (_) {
    // The node that answers may not have the new block yet; the registration itself is mined
    console.log('Owner and URI are not readable yet; read them again in a few seconds.');
  }
  console.log('AGENT_REGISTRATIONS =', JSON.stringify([{ agentId: Number(agentId), agentRegistry: `eip155:${chainId}:${IDENTITY_REGISTRY}` }]));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
