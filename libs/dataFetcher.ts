// @ts-nocheck
import PouchDB from 'pouchdb'

import find from 'pouchdb-find'
import rel from 'relational-pouch'


export interface DataFetcherOptions {
  dbName: string | unknown,
}

export default class DataFetcher {
  private db: PouchDB.Database

  constructor(options: DataFetcherOptions) {
    // enable relationalPouch
    PouchDB.plugin(rel)
    PouchDB.plugin(find)
    this.db = new PouchDB({
    name: process.env.DB_SERVER + `/${options.dbName}`,
    skip_setup: true,
    fetch: function (url, opts) {
        opts.headers.set('Authorization', `Basic ${process.env.DB_AUTH}`);
        return PouchDB.fetch(url, opts);
    }})
  }

  getDB(): PouchDB.Database {
    return this.db
  }

  async getInfo() {
    return await this.db.info()
  }

  async save(document: object): Promise<PouchDB.Core.Response> {
    return this.getDB().put(document)
  }

  async get(id: string): Promise<any> {
    return this.db.get(id)
  }

  mapQuery(partition:string) {

  }

  async findInPartition(partition: string, selectorObject: Object, extra?: object, index?: string[]) {
    const selector = {
      _id: {
        $regex: partition+":",
      },
      ...selectorObject
    }
    const result = await this.getDB().find({
      selector: selector,
      ...extra
    })
    return result.docs
  }

  async getMany(pattern: string, skip?: number, limit?: number): Promise<any> {
    return this.db.allDocs({
      include_docs: true,
      limit: 99,
      skip: 0,
      startkey: `${pattern}`,
      endkey: `${pattern}\ufff0`
    })
  }

  async delete(documentId) {
    return this.db.remove(documentId)
  }
}