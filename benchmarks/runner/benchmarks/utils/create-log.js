const Keystore = require('orbit-db-keystore')
const IdentityProvider = require('orbit-db-identity-provider')
const leveldown = require('leveldown')
const storage = require('orbit-db-storage-adapter')(leveldown)

const Log = require('../../../../src/log')
const AccessController = Log.AccessController

const createLog = async (ipfs, logId) => {
  const access = new AccessController()
  const keysPath = './ipfs-log-benchmarks/keys'
  const store = await storage.createStore(keysPath)
  const keystore = new Keystore(store)
  const identity = await IdentityProvider.createIdentity({ id: 'userA', keystore })
  const log = new Log(ipfs, identity, { logId: 'A', access })
  return { log, access, identity }
}

module.exports = createLog
