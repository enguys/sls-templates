const getCognitoIdentityId = event => event.requestContext.identity.cognitoIdentityId;

const getRequestBody = event => JSON.parse(event.body);

const getQueryStringParams = event => event.queryStringParameters || {};

const getQueryStringParam = (event, name, fallback) => {
  const params = getQueryStringParams(event);
  return params[name] || fallback;
};

const getPathParams = event => event.pathParameters || {};

const getPathParam = (event, name, fallback) => {
  const params = getPathParams(event);
  return params[name] || fallback;
};

const createResponse = (body, statusCode = 200, headers = {}) => ({
  statusCode,
  headers: Object.assign({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': true,
  }, headers),
  body: (typeof body === 'string') ? body : JSON.stringify(body),
});

const createNotFoundResponse = (message = null) => {
  const body = {};
  if (message) {
    body.message = message;
  }
  return createResponse(body, 404);
};

const createBadRequestResponse = (violations = [], message = null) => {
  const body = {
    message: message || violations.map(violation => violation.message).join('. '),
  };
  if (violations) {
    body.violations = violations;
  }
  return createResponse(body, 400);
};

const createErrorResponse = error => createResponse(
  { message: error.message },
  error.statusCode || 501,
);

export {
  getCognitoIdentityId,
  getRequestBody,
  getQueryStringParams,
  getQueryStringParam,
  getPathParams,
  getPathParam,
  createResponse,
  createNotFoundResponse,
  createBadRequestResponse,
  createErrorResponse,
};
