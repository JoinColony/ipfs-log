'use strict'

const Clock = require('./lamport-clock')
const { isDefined, io } = require('./utils')
const stringify = require('json-stringify-deterministic')
const IPLD_LINKS = ['next']
const IpfsNotDefinedError = () => new Error('Ipfs instance not defined')
const writeFormats = {
  0: 'dag-pb',
  1: 'dag-cbor'
}

class Entry {
  /**
   * Create an Entry
   * @param {IPFS} ipfs An IPFS instance
   * @param {Identity} identity The identity instance
   * @param {string} logId The unique identifier for this log
   * @param {*} data Data of the entry to be added. Can be any JSON.stringifyable data
   * @param {Array<string|Entry>} [next=[]] Parent hashes or entries
   * @param {LamportClock} [clock] The lamport clock
   * @returns {Promise<Entry>}
   * @example
   * const entry = await Entry.create(ipfs, identity, 'hello')
   * console.log(entry)
   * // { hash: null, payload: "hello", next: [] }
   */
  static async create (ipfs, identity, logId, data, next = [], clock) {
    if (!isDefined(ipfs)) throw IpfsNotDefinedError()
    if (!isDefined(identity)) throw new Error('Identity is required, cannot create entry')
    if (!isDefined(logId)) throw new Error('Entry requires an id')
    if (!isDefined(data)) throw new Error('Entry requires data')
    if (!isDefined(next) || !Array.isArray(next)) throw new Error("'next' argument is not an array")

    // Clean the next objects and convert to hashes
    const toEntry = (e) => e.hash ? e.hash : e
    const nexts = next.filter(isDefined).map(toEntry)

    const entry = {
      hash: null, // "zd...Foo", we'll set the hash after persisting the entry
      id: logId, // For determining a unique chain
      payload: data, // Can be any JSON.stringifyable data
      next: nexts, // Array of hashes
      v: 1, // To tag the version of this data structure
      clock: clock || new Clock(identity.publicKey)
    }

    const signature = await identity.provider.sign(identity, Entry.toBuffer(entry))

    entry.key = identity.publicKey
    entry.identity = identity.toJSON()
    entry.sig = signature
    entry.hash = await Entry.toMultihash(ipfs, entry)

    return entry
  }

  /**
   * Verifies an entry signature.
   *
   * @param {IdentityProvider} identityProvider The identity provider to use
   * @param {Entry} entry The entry being verified
   * @return {Promise} A promise that resolves to a boolean value indicating if the signature is valid
   */
  static async verify (identityProvider, entry) {
    if (!identityProvider) throw new Error('Identity-provider is required, cannot verify entry')
    if (!Entry.isEntry(entry)) throw new Error('Invalid Log entry')
    if (!entry.key) throw new Error("Entry doesn't have a key")
    if (!entry.sig) throw new Error("Entry doesn't have a signature")

    const e = {
      hash: null,
      id: entry.id,
      payload: entry.payload,
      next: entry.next,
      v: entry.v,
      clock: entry.clock
    }

    return identityProvider.verify(entry.sig, entry.key, Entry.toBuffer(e), 'v' + entry.v)
  }

  /**
   * Transforms an entry into a Buffer.
   * @param {Entry} entry The entry
   * @return {Buffer} The buffer
   */
  static toBuffer (entry) {
    const stringifiedEntry = entry.v === 0 ? JSON.stringify(entry) : stringify(entry)
    return Buffer.from(stringifiedEntry)
  }

  /**
   * Get the multihash of an Entry.
   * @param {IPFS} ipfs An IPFS instance
   * @param {Entry} entry Entry to get a multihash for
   * @returns {Promise<string>}
   * @example
   * const multihash = await Entry.toMultihash(ipfs, entry)
   * console.log(multihash)
   * // "Qm...Foo"
   * @deprecated
   */
  static async toMultihash (ipfs, entry) {
    if (!ipfs) throw IpfsNotDefinedError()
    if (!Entry.isEntry(entry)) throw new Error('Invalid object format, cannot generate entry hash')

    // Ensure `entry` follows the correct format
    const e = {
      hash: null,
      id: entry.id,
      payload: entry.payload,
      next: entry.next,
      v: entry.v,
      clock: entry.clock
    }

    if (entry.key) Object.assign(e, { key: entry.key })
    if (entry.identity) Object.assign(e, { identity: entry.identity })
    if (entry.sig) Object.assign(e, { sig: entry.sig })

    return io.write(ipfs, writeFormats[e.v], e, { links: IPLD_LINKS })
  }

  /**
   * Create an Entry from a hash.
   * @param {IPFS} ipfs An IPFS instance
   * @param {string} hash The hash to create an Entry from
   * @returns {Promise<Entry>}
   * @example
   * const entry = await Entry.fromMultihash(ipfs, "zd...Foo")
   * console.log(entry)
   * // { hash: "Zd...Foo", payload: "hello", next: [] }
   */
  static async fromMultihash (ipfs, hash) {
    if (!ipfs) throw IpfsNotDefinedError()
    if (!hash) throw new Error(`Invalid hash: ${hash}`)

    const e = await io.read(ipfs, hash, { links: IPLD_LINKS })

    let entry = {
      hash: hash,
      id: e.id,
      payload: e.payload,
      next: e.next,
      v: e.v,
      clock: new Clock(e.clock.id, e.clock.time)
    }

    if (e.key) Object.assign(entry, { key: e.key })
    if (e.identity) Object.assign(entry, { identity: e.identity })
    if (e.sig) Object.assign(entry, { sig: e.sig })

    return entry
  }

  /**
   * Check if an object is an Entry.
   * @param {Entry} obj
   * @returns {boolean}
   */
  static isEntry (obj) {
    return obj && obj.id !== undefined &&
      obj.next !== undefined &&
      obj.payload !== undefined &&
      obj.v !== undefined &&
      obj.hash !== undefined &&
      obj.clock !== undefined
  }

  /**
   * Compares two entries.
   * @param {Entry} a
   * @param {Entry} b
   * @returns {number} 1 if a is greater, -1 is b is greater
   */
  static compare (a, b) {
    var distance = Clock.compare(a.clock, b.clock)
    if (distance === 0) return a.clock.id < b.clock.id ? -1 : 1
    return distance
  }

  /**
   * Check if an entry equals another entry.
   * @param {Entry} a
   * @param {Entry} b
   * @returns {boolean}
   */
  static isEqual (a, b) {
    return a.hash === b.hash
  }

  /**
   * Check if an entry is a parent to another entry.
   * @param {Entry} entry1 Entry to check
   * @param {Entry} entry2 The parent Entry
   * @returns {boolean}
   */
  static isParent (entry1, entry2) {
    return entry2.next.indexOf(entry1.hash) > -1
  }

  /**
   * Find entry's children from an Array of entries.
   * Returns entry's children as an Array up to the last know child.
   * @param {Entry} entry Entry for which to find the parents
   * @param {Array<Entry>} values Entries to search parents from
   * @returns {Array<Entry>}
   */
  static findChildren (entry, values) {
    var stack = []
    var parent = values.find((e) => Entry.isParent(entry, e))
    var prev = entry
    while (parent) {
      stack.push(parent)
      prev = parent
      parent = values.find((e) => Entry.isParent(prev, e))
    }
    stack = stack.sort((a, b) => a.clock.time > b.clock.time)
    return stack
  }
}

module.exports = Entry
