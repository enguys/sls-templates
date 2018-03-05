import { createResponse } from './ultis/http';

export const hello = (event, context, callback) => {
  callback(null, createResponse({
    message: 'Go Serverless v1.0! Your function executed successfully!',
    input: event,
  }));

  // Use this code if you don't use the http event with the LAMBDA-PROXY integration
  // callback(null, { message: 'Go Serverless v1.0! Your function executed successfully!', event });
};
