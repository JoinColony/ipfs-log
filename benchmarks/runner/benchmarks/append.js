const startIPFS = require('./utils/start-ipfs')
const releaseRepo = require('./utils/release-repo')
const createLog = require('./utils/create-log')

const base = {
  prepare: async function () {
    const { ipfs, repo } = await startIPFS('./ipfs-log-benchmarks/ipfs')
    const { log } = await createLog(ipfs, 'A')
    return { log, ipfs, repo }
  },
  cycle: async function ({ log }) {
    await log.append('Hello', 32)
  },
  teardown: async function ({ repo }) {
    await releaseRepo(repo)
  }
}

const baseline = {
  while: ({ stats, startTime, baselineLimit }) => {
    return stats.count < baselineLimit
  }
}

const stress = {
  while: ({ stats, startTime, stressLimit }) => {
    return process.hrtime(startTime)[0] < stressLimit
  }
}

module.exports = [
  { name: 'append-baseline', ...base, ...baseline },
  { name: 'append-stress', ...base, ...stress }
]
