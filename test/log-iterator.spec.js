'use strict'

const assert = require('assert')
const rmrf = require('rimraf')
const fs = require('fs-extra')
const Log = require('../src/log')
const IdentityProvider = require('orbit-db-identity-provider')
const Keystore = require('orbit-db-keystore')

// Test utils
const {
  config,
  testAPIs,
  startIpfs,
  stopIpfs,
  LogCreator,
  implementations
} = require('orbit-db-test-utils')

const properLevelModule = implementations.filter(i => i.key.indexOf('level') > -1).map(i => i.module)[0]
const storage = require('orbit-db-storage-adapter')(properLevelModule)

let ipfs, testIdentity, testIdentity2, testIdentity3

Object.keys(testAPIs).forEach((IPFS) => {
  describe('Log - Iterator (' + IPFS + ')', function () {
    this.timeout(config.timeout)

    const { identityKeyFixtures, signingKeyFixtures, identityKeysPath, signingKeysPath } = config
    const ipfsConfig = Object.assign({}, config.defaultIpfsConfig, {
      repo: config.defaultIpfsConfig.repo + '-log-join' + new Date().getTime()
    })

    let identityStore, signingStore

    before(async () => {
      rmrf.sync(ipfsConfig.repo)
      rmrf.sync(identityKeysPath)
      rmrf.sync(signingKeysPath)
      await fs.copy(identityKeyFixtures, identityKeysPath)
      await fs.copy(signingKeyFixtures, signingKeysPath)

      identityStore = await storage.createStore(identityKeysPath)
      signingStore = await storage.createStore(signingKeysPath)
      const keystore = new Keystore(identityStore)
      const signingKeystore = new Keystore(signingStore)

      testIdentity = await IdentityProvider.createIdentity({ id: 'userA', keystore, signingKeystore })
      testIdentity2 = await IdentityProvider.createIdentity({ id: 'userB', keystore, signingKeystore })
      testIdentity3 = await IdentityProvider.createIdentity({ id: 'userC', keystore, signingKeystore })
      ipfs = await startIpfs(IPFS, ipfsConfig)
    })

    after(async () => {
      await stopIpfs(ipfs)
      rmrf.sync(ipfsConfig.repo)
      rmrf.sync(identityKeysPath)
      rmrf.sync(signingKeysPath)

      await identityStore.close()
      await signingStore.close()
    })

    describe('Basic iterator functionality', () => {
      let log1

      beforeEach(async () => {
        log1 = new Log(ipfs, testIdentity, { logId: 'X' })

        for (let i = 0; i <= 100; i++) {
          await log1.append('entry' + i)
        }
      })

      it('returns a Symbol.iterator object', async () => {
        let it = log1.iterator({
          lte: 'zdpuB1Sfee86mNznzZfVGJhv3BZeF9QpxpXUJq5bHG7soq3NJ',
          amount: 0
        })

        assert.strictEqual(typeof it[Symbol.iterator], 'function')
        assert.deepStrictEqual(it.next(), { value: undefined, done: true })
      })

      it('returns length with lte and amount', async () => {
        let amount = 10
        let it = log1.iterator({
          lte: 'zdpuB1Sfee86mNznzZfVGJhv3BZeF9QpxpXUJq5bHG7soq3NJ',
          amount: amount
        })

        assert.strictEqual([...it].length, 10)
      })

      it('returns entries with lte and amount', async () => {
        let amount = 10

        let it = log1.iterator({
          lte: 'zdpuB1Sfee86mNznzZfVGJhv3BZeF9QpxpXUJq5bHG7soq3NJ',
          amount: amount
        })

        let i = 0
        for (let entry of it) {
          assert.strictEqual(entry.payload, 'entry' + (67 - i++))
        }
      })

      it('returns length with lt and amount', async () => {
        let amount = 10

        let it = log1.iterator({
          lt: 'zdpuB1Sfee86mNznzZfVGJhv3BZeF9QpxpXUJq5bHG7soq3NJ',
          amount: amount
        })

        assert.strictEqual([...it].length, amount)
      })

      it('returns entries with lt and amount', async () => {
        let amount = 10

        let it = log1.iterator({
          lt: 'zdpuB1Sfee86mNznzZfVGJhv3BZeF9QpxpXUJq5bHG7soq3NJ',
          amount: amount
        })

        let i = 1
        for (let entry of it) {
          assert.strictEqual(entry.payload, 'entry' + (67 - i++))
        }
      })

      it('returns correct length with gt and amount', async () => {
        let amount = 5
        let it = log1.iterator({
          gt: 'zdpuB1Sfee86mNznzZfVGJhv3BZeF9QpxpXUJq5bHG7soq3NJ',
          amount: amount
        })

        let i = 0
        let count = 0
        for (let entry of it) {
          assert.strictEqual(entry.payload, 'entry' + (72 - i++))
          count++
        }
        assert.strictEqual(count, amount)
      })

      it('returns length with gte and amount', async () => {
        let amount = 12

        let it = log1.iterator({
          gt: 'zdpuB1Sfee86mNznzZfVGJhv3BZeF9QpxpXUJq5bHG7soq3NJ',
          amount: amount
        })

        assert.strictEqual([...it].length, amount)
      })

      it('returns entries with gte and amount', async () => {
        let amount = 12

        let it = log1.iterator({
          gt: 'zdpuB1Sfee86mNznzZfVGJhv3BZeF9QpxpXUJq5bHG7soq3NJ',
          amount: amount
        })

        let i = 0
        for (let entry of it) {
          assert.strictEqual(entry.payload, 'entry' + (79 - i++))
        }
      })

      /* eslint-disable camelcase */
      it('iterates with lt and gt', async () => {
        let it = log1.iterator({
          gt: 'zdpuAr2A6sofCcU4otgq82eLbGY5PajgnnS4ZpBteWU1mbzeY',
          lt: 'zdpuAyABZACdN3jQRddGmLKHqgpDeACVZR6JeRVos3akN2DTD'
        })
        let hashes = [...it].map(e => e.hash)

        // neither hash should appear in the array
        assert.strictEqual(hashes.indexOf('zdpuAr2A6sofCcU4otgq82eLbGY5PajgnnS4ZpBteWU1mbzeY'), -1)
        assert.strictEqual(hashes.indexOf('zdpuAyABZACdN3jQRddGmLKHqgpDeACVZR6JeRVos3akN2DTD'), -1)
        assert.strictEqual(hashes.length, 10)
      })

      it('iterates with lt and gte', async () => {
        let it = log1.iterator({
          gte: 'zdpuAvUnpLX191LRy1pRDMYWp7PPTB3xnxgbLXou3vJL1gAbk',
          lt: 'zdpuAucCgLdFnBV8pJB6Z48fYdQZGG84Z3JYJHczD4PfJNAnP'
        })
        let hashes = [...it].map(e => e.hash)

        // only the gte hash should appear in the array
        assert.strictEqual(hashes.indexOf('zdpuAvUnpLX191LRy1pRDMYWp7PPTB3xnxgbLXou3vJL1gAbk'), 24)
        assert.strictEqual(hashes.indexOf('zdpuAucCgLdFnBV8pJB6Z48fYdQZGG84Z3JYJHczD4PfJNAnP'), -1)
        assert.strictEqual(hashes.length, 25)
      })

      it('iterates with lte and gt', async () => {
        let it = log1.iterator({
          gt: 'zdpuApFnBexV9iPiXdqDQyN8zBYyNqGEVXnoPVSNpdAyJ993N',
          lte: 'zdpuAq5xQKBccFjMwBUqUwt3EQfpCZjk9ucDGRqm6WWFa5M4e'
        })
        let hashes = [...it].map(e => e.hash)

        // only the lte hash should appear in the array
        assert.strictEqual(hashes.indexOf('zdpuApFnBexV9iPiXdqDQyN8zBYyNqGEVXnoPVSNpdAyJ993N'), -1)
        assert.strictEqual(hashes.indexOf('zdpuAq5xQKBccFjMwBUqUwt3EQfpCZjk9ucDGRqm6WWFa5M4e'), 0)
        assert.strictEqual(hashes.length, 4)
      })

      it('iterates with lte and gte', async () => {
        let it = log1.iterator({
          gte: 'zdpuAuumRu2NG5GuCoaPpoGoCDBSR7e7RVNC6a4XXg8qjPFYP',
          lte: 'zdpuAtjnaQiMiF3CaCxdcmAKy1xXgTpsxfh9yZCsFQM3e9oMU'
        })
        let hashes = [...it].map(e => e.hash)

        // neither hash should appear in the array
        assert.strictEqual(hashes.indexOf('zdpuAuumRu2NG5GuCoaPpoGoCDBSR7e7RVNC6a4XXg8qjPFYP'), 9)
        assert.strictEqual(hashes.indexOf('zdpuAtjnaQiMiF3CaCxdcmAKy1xXgTpsxfh9yZCsFQM3e9oMU'), 0)
        assert.strictEqual(hashes.length, 10)
      })

      it('returns length with gt and default amount', async () => {
        let it = log1.iterator({
          gt: 'zdpuB1Sfee86mNznzZfVGJhv3BZeF9QpxpXUJq5bHG7soq3NJ'
        })

        assert.strictEqual([...it].length, 33)
      })

      it('returns entries with gt and default amount', async () => {
        let it = log1.iterator({
          gt: 'zdpuB1Sfee86mNznzZfVGJhv3BZeF9QpxpXUJq5bHG7soq3NJ'
        })

        let i = 0
        for (let entry of it) {
          assert.strictEqual(entry.payload, 'entry' + (100 - i++))
        }
      })

      it('returns length with gte and default amount', async () => {
        let it = log1.iterator({
          gte: 'zdpuB1Sfee86mNznzZfVGJhv3BZeF9QpxpXUJq5bHG7soq3NJ'
        })

        assert.strictEqual([...it].length, 34)
      })

      it('returns entries with gte and default amount', async () => {
        let it = log1.iterator({
          gte: 'zdpuB1Sfee86mNznzZfVGJhv3BZeF9QpxpXUJq5bHG7soq3NJ'
        })

        let i = 0
        for (let entry of it) {
          assert.strictEqual(entry.payload, 'entry' + (100 - i++))
        }
      })

      it('returns length with lt and default amount value', async () => {
        let it = log1.iterator({
          lt: 'zdpuB1Sfee86mNznzZfVGJhv3BZeF9QpxpXUJq5bHG7soq3NJ'
        })

        assert.strictEqual([...it].length, 67)
      })

      it('returns entries with lt and default amount value', async () => {
        let it = log1.iterator({
          lt: 'zdpuB1Sfee86mNznzZfVGJhv3BZeF9QpxpXUJq5bHG7soq3NJ'
        })

        let i = 0
        for (let entry of it) {
          assert.strictEqual(entry.payload, 'entry' + (66 - i++))
        }
      })

      it('returns length with lte and default amount value', async () => {
        let it = log1.iterator({
          lte: 'zdpuB1Sfee86mNznzZfVGJhv3BZeF9QpxpXUJq5bHG7soq3NJ'
        })

        assert.strictEqual([...it].length, 68)
      })

      it('returns entries with lte and default amount value', async () => {
        let it = log1.iterator({
          lte: 'zdpuB1Sfee86mNznzZfVGJhv3BZeF9QpxpXUJq5bHG7soq3NJ'
        })

        let i = 0
        for (let entry of it) {
          assert.strictEqual(entry.payload, 'entry' + (67 - i++))
        }
      })
    })

    describe('Iteration over forked/joined logs', () => {
      let fixture, identities

      before(async () => {
        identities = [testIdentity3, testIdentity2, testIdentity3, testIdentity]
        fixture = await LogCreator.createLogWithSixteenEntries(Log, ipfs, identities)
      })

      it('returns the full length from all heads', async () => {
        let it = fixture.log.iterator({
          lte: fixture.log.heads
        })

        assert.strictEqual([...it].length, 16)
      })

      it('returns partial entries from all heads', async () => {
        let it = fixture.log.iterator({
          lte: fixture.log.heads,
          amount: 6
        })

        assert.deepStrictEqual([...it].map(e => e.payload),
          ['entryA10', 'entryA9', 'entryA8', 'entryA7', 'entryC0', 'entryA6'])
      })

      it('returns partial logs from single heads #1', async () => {
        let it = fixture.log.iterator({
          lte: [fixture.log.heads[0]]
        })

        assert.strictEqual([...it].length, 10)
      })

      it('returns partial logs from single heads #2', async () => {
        let it = fixture.log.iterator({
          lte: [fixture.log.heads[1]]
        })

        assert.strictEqual([...it].length, 11)
      })

      it('throws error if lt/lte not a string or array of entries', async () => {
        let errMsg

        try {
          fixture.log.iterator({
            lte: fixture.log.heads[1]
          })
        } catch (e) {
          errMsg = e.message
        }

        assert.strictEqual(errMsg, 'lt or lte must be a string or array of Entries')
      })
    })
  })
})
