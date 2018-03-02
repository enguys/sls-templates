const path = require('path');
const slsw = require('serverless-webpack');
const nodeExternals = require('webpack-node-externals');

const entries = Object.keys(slsw.lib.entries).reduce((accumulator, currentValue) => {
  accumulator[currentValue] = ['babel-polyfill', slsw.lib.entries[currentValue]];
  return accumulator;
}, {});

module.exports = {
  entry: entries,
  target: 'node',
  mode: 'production',
  output: {
    libraryTarget: 'commonjs',
    path: path.join(__dirname, '.webpack'),
    filename: '[name].js',
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: 'babel-loader',
      },
    ],
  },
  externals: [nodeExternals()],
};
