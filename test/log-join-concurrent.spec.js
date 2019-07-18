'use strict'
const assert = require('assert')
const rmrf = require('rimraf')
const fs = require('fs-extra')
const Log = require('../src/log')
const { SortByEntryHash } = Log.Sorting
const IdentityProvider = require('orbit-db-identity-provider')

// Test utils
const {
  config,
  testAPIs,
  startIpfs,
  stopIpfs
} = require('./utils')

let ipfs, testIdentity

Object.keys(testAPIs).forEach(IPFS => {
  describe('Log - Join Concurrent Entries (' + IPFS + ')', function () {
    this.timeout(config.timeout)

    const { identityKeyFixtures, signingKeyFixtures, identityKeysPath, signingKeysPath } = config
    const ipfsConfig = Object.assign({}, config.defaultIpfsConfig, {
      repo: config.defaultIpfsConfig.repo + '-log-join-concurrent' + new Date().getTime()
    })

    before(async () => {
      rmrf.sync(ipfsConfig.repo)
      rmrf.sync(identityKeysPath)
      rmrf.sync(signingKeysPath)
      await fs.copy(identityKeyFixtures, identityKeysPath)
      await fs.copy(signingKeyFixtures, signingKeysPath)
      testIdentity = await IdentityProvider.createIdentity({ id: 'userA', identityKeysPath, signingKeysPath })
      ipfs = await startIpfs(IPFS, ipfsConfig)
    })

    after(async () => {
      await stopIpfs(ipfs)
      rmrf.sync(ipfsConfig.repo)
      rmrf.sync(identityKeysPath)
      rmrf.sync(signingKeysPath)
    })

    describe('join ', async () => {
      let log1, log2

      before(async () => {
        log1 = new Log(ipfs, testIdentity, { logId: 'A', sortFn: SortByEntryHash })
        log2 = new Log(ipfs, testIdentity, { logId: 'A', sortFn: SortByEntryHash })
      })

      it('joins consistently', async () => {
        for (let i = 0; i < 10; i++) {
          await log1.append('hello1-' + i)
          await log2.append('hello2-' + i)
        }

        await log1.join(log2)
        await log2.join(log1)

        let hash1 = await log1.toMultihash()
        let hash2 = await log2.toMultihash()

        assert.strictEqual(hash1, hash2)
        assert.deepStrictEqual(log1.values.map(e => e.payload), log2.values.map(e => e.payload))
      })
    })
  })
})
