export const getCognitoIdentityId = event => event.requestContext.identity.cognitoIdentityId;

export const getRequestBody = event => JSON.parse(event.body);

export const getQueryStringParams = event => event.queryStringParameters || {};

export const getQueryStringParam = (event, name, fallback) => {
  const params = getQueryStringParams(event);
  return params[name] || fallback;
};

export const getPathParams = event => event.pathParameters || {};

export const getPathParam = (event, name, fallback) => {
  const params = getPathParams(event);
  return params[name] || fallback;
};

export const createResponse = (body, statusCode = 200, headers = {}) => ({
  statusCode,
  headers: Object.assign({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': true,
  }, headers),
  body: (typeof body === 'string') ? body : JSON.stringify(body),
});

export const createNotFoundResponse = (message = null) => {
  const body = {};
  if (message) {
    body.message = message;
  }
  return createResponse(body, 404);
};

export const createBadRequestResponse = (violations = [], message = null) => {
  const body = {
    message: message || violations.map(violation => violation.message).join('. '),
  };
  if (violations) {
    body.violations = violations;
  }
  return createResponse(body, 400);
};

export const createErrorResponse = error => createResponse(
  { message: error.message },
  error.statusCode || 501,
);
