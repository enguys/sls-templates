const hello = async (event, context) => {
  const response = {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Go Serverless v1.0! Your function executed successfully!',
      event,
      context,
    }),
  };
  return response;
};

export { hello };
