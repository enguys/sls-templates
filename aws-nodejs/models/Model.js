/* eslint-disable no-underscore-dangle */
import { DynamoDB } from 'aws-sdk';
import Joi from 'joi';
import moment from 'moment';
import base64Url from 'base64-url';
import omitEmpty from 'omit-empty';
import { debug } from '../ultis/logger';

const abstractMethod = (className, methodName) => {
  throw new Error(`Subclasses of ${className} must override ${methodName} with their own implementation.`);
};

const dynamoDBConfig = {
  region: process.env.AWS_REGION || 'us-east-1',
};

class Model {
  static db = new DynamoDB.DocumentClient(dynamoDBConfig);

  static get tableName() {
    abstractMethod('Model', 'tableName');
    return null;
  }

  static get hashKey() {
    return 'id';
  }

  static get rangeKey() {
    return null;
  }

  static get maxRetries() {
    return 10;
  }

  static get retryDelay() {
    return 50;
  }

  static get schema() {
    abstractMethod('Model', 'schema');
    return null;
  }

  static get validationOptions() {
    return {
      abortEarly: false,
      allowUnknown: true,
    };
  }

  static validate(item) {
    return new Promise((resolve) => {
      Joi.validate(item, this.schema, this.validationOptions, (error) => {
        if (error) {
          const { details } = error;
          const violations = details.map(detail => ({
            path: detail.path.join('.'),
            message: detail.message,
            context: detail.context,
          }));
          resolve(violations);
        }
        resolve([]);
      });
    });
  }

  static create(item) {
    debug('= Model.create', item);
    const itemParams = {
      TableName: this.tableName,
      Item: item,
      ReturnValues: 'ALL_OLD',
    };
    itemParams.Item.createdAt = moment().unix();
    return this._client('put', itemParams);
  }

  static find(hash, range) {
    return new Promise((resolve, reject) => {
      debug('= Model.find', hash, range);
      const params = {
        TableName: this.tableName,
        Key: this._buildKey(hash, range),
      };
      this._client('get', params)
        .then(result => resolve(result.Item || {}))
        .catch(err => reject(err));
    });
  }

  static update(params, hash, range) {
    return new Promise((resolve, reject) => {
      debug('= Model.update', hash, range, JSON.stringify(params));
      const dbParams = {
        TableName: this.tableName,
        Key: this._buildKey(hash, range),
        AttributeUpdates: this._buildAttributeUpdates(params),
        ReturnValues: 'ALL_NEW',
      };
      dbParams.AttributeUpdates.updatedAt = moment().unix();
      this._client('update', dbParams)
        .then(result => resolve(result.Attributes))
        .catch(err => reject(err));
    });
  }

  static delete(hash, range) {
    return new Promise((resolve, reject) => {
      debug('= Model.delete', hash);
      const params = {
        TableName: this.tableName,
        Key: this._buildKey(hash, range),
      };
      this._client('delete', params)
        .then(() => resolve(true))
        .catch(err => reject(err));
    });
  }

  static findOneBy(params) {
    const queryParams = Object.assign({}, {
      TableName: this.tableName,
      Limit: 1,
    }, params);
    return new Promise((resolve, reject) => {
      this._client('query', queryParams)
        .then((result) => {
          if (result.Items.length === 0) {
            resolve(null);
          } else {
            resolve(result.Items[0]);
          }
        })
        .catch(error => reject(error));
    });
  }

  static findBy(params, page = null, pageSize = 10, recursive = false) {
    const queryParams = Object.assign({}, {
      TableName: this.tableName,
      Limit: pageSize,
    }, params);
    if (page) {
      queryParams.ExclusiveStartKey = this._exclusiveStartKey(page);
    }
    return new Promise((resolve, reject) => {
      this._client('query', queryParams)
        .then((result) => {
          if (!recursive) {
            return Promise.resolve(result);
          }
          return this._recursiveFindBy(queryParams, pageSize - result.Items.length, result);
        })
        .then(result => resolve(this._buildListResponse(result, params)))
        .catch(error => reject(error));
    });
  }

  static findAllBy(params) {
    const queryParams = Object.assign({}, {
      TableName: this.tableName,
    }, params);
    return new Promise((resolve, reject) => {
      this._client('query', queryParams)
        .then(result => this._recursiveFindAllBy(queryParams, result))
        .then(result => resolve(result.Items || []))
        .catch(error => reject(error));
    });
  }

  static batchCreate(items) {
    debug('= Model.batchCreate', items);
    const itemsParams = { RequestItems: {} };
    itemsParams.RequestItems[this.tableName] = items.map(item => ({
      PutRequest: { Item: omitEmpty(item) },
    }));
    return this._client('batchWrite', itemsParams);
  }

  static batchUpdate(items) {
    debug('= Model.batchUpdate', items);
    const itemsParams = { RequestItems: {} };
    itemsParams.RequestItems[this.tableName] = items.map(item => ({
      PutRequest: { Item: omitEmpty(item) },
    }));
    return this._client('batchWrite', itemsParams);
  }

  static batchDelete(keys) {
    debug('= Model.batchDelete', keys);
    const itemsParams = { RequestItems: {} };
    itemsParams.RequestItems[this.tableName] = keys.map(key => ({
      DeleteRequest: { Key: this._buildKey(key[0], key[1]) },
    }));
    return this._client('batchWrite', itemsParams);
  }

  static _recursiveFindBy(params, limit, results) {
    debug('= Model._recursiveFindBy', params, limit, results);
    if (!results.LastEvaluatedKey || limit <= 0) {
      return Promise.resolve(results);
    }
    const queryParams = Object.assign({}, params, {
      Limit: limit,
      ExclusiveStartKey: results.LastEvaluatedKey,
    });
    return this._client('query', queryParams).then((result) => {
      const oldResults = { ...results };
      delete oldResults.LastEvaluatedKey;
      const newResults = Object.assign({}, oldResults, result, {
        Items: [...results.Items, ...result.Items],
      });
      return this._recursiveFindBy(params, limit - result.Items.length, newResults);
    });
  }

  static _recursiveFindAllBy(params, results) {
    debug('= Model._recursiveFindAllBy', params, results);
    if (!results.LastEvaluatedKey) {
      return Promise.resolve(results);
    }
    const queryParams = Object.assign({}, params, {
      ExclusiveStartKey: results.LastEvaluatedKey,
    });
    return this._client('query', queryParams).then((result) => {
      const oldResults = { ...results };
      delete oldResults.LastEvaluatedKey;
      const newResults = Object.assign({}, oldResults, result, {
        Items: [...results.Items, ...result.Items],
      });
      return this._recursiveFindAllBy(params, newResults);
    });
  }

  static _buildListResponse(result, params = {}) {
    const items = result.Items;
    const response = {
      items,
    };
    const paginationKeys = this._buildPaginationKey(result, params, items);
    Object.assign(response, paginationKeys);
    return response;
  }

  static _buildPaginationKey(result, params, items, options) {
    debug('= Model._buildPaginationKey', JSON.stringify(params));
    const paginationKey = {};
    if (items && items.length > 0) {
      if (result.LastEvaluatedKey) {
        const lastItem = items[items.length - 1];
        const lastKey = this._buildItemKey(lastItem, options);
        Object.assign(paginationKey, { nextPage: base64Url.encode(JSON.stringify(lastKey)) });
      }
      if (params.ExclusiveStartKey) {
        const firstItem = items[0];
        const prevKey = this._buildItemKey(firstItem, options);
        Object.assign(paginationKey, { prevPage: `-${base64Url.encode(JSON.stringify(prevKey))}` });
      }
    }
    return paginationKey;
  }

  static _exclusiveStartKey(page) {
    return JSON.parse(base64Url.decode(page));
  }

  static _buildKey(hash, range) {
    const key = {
      [this.hashKey]: hash,
    };
    if (this.rangeKey) {
      key[this.rangeKey] = range;
    }
    return key;
  }

  static _buildItemKey(item) {
    const key = {
      [this.hashKey]: item[this.hashKey],
    };
    if (this.rangeKey) {
      key[this.rangeKey] = item[this.rangeKey];
    }
    return key;
  }

  static _buildAttributeUpdates(params) {
    const attrUpdates = {};
    Object.keys(params).forEach((key) => {
      if (key !== this.hashKey && key !== this.rangeKey) {
        const value = params[key];
        if (value === null) {
          attrUpdates[key] = { Action: 'DELETE' };
        } else {
          attrUpdates[key] = {
            Action: 'PUT',
            Value: value,
          };
        }
      }
    });
    return attrUpdates;
  }

  static _client(method, params, retries = 0) {
    return new Promise((resolve, reject) => {
      debug('Model._client', JSON.stringify(params));
      this.db[method](params, (err, data) => {
        if (err) {
          debug('= Model._client', method, 'Error', err);
          reject(err);
        } else {
          debug('= Model._client', method, 'Success');
          if (
            data.UnprocessedItems &&
            Object.keys(data.UnprocessedItems).length > 0 &&
            retries < this.maxRetries
          ) {
            debug('= Model._client', method, 'Some unprocessed items... Retrying', JSON.stringify(data));
            const retryParams = { RequestItems: data.UnprocessedItems };
            const delay = this.retryDelay * (2 ** retries);
            setTimeout(() => {
              resolve(this._client(method, retryParams, retries + 1));
            }, delay);
          } else {
            debug('= Model._client', method, 'resolving', JSON.stringify(data));
            resolve(data);
          }
        }
      });
    });
  }
}

export default Model;
