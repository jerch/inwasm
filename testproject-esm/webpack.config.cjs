const path = require('path');

const umd = {
  entry: './lib/index.js',
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.js?$/,
        use: ["source-map-loader"],
        enforce: "pre",
        exclude: /node_modules/
      },
    ],
  },
  output: {
    filename: 'umd.js',
    path: path.resolve(__dirname, 'dist'),
    libraryTarget: 'umd',
    library: ['dummy']
  },
  mode: 'production'
};

const esm = {
  entry: './lib/index.js',
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.js?$/,
        use: ["source-map-loader"],
        enforce: "pre",
        exclude: /node_modules/
      },
    ],
  },
  output: {
    filename: 'esm.js',
    path: path.resolve(__dirname, 'dist'),
    libraryTarget: 'module'
  },
  mode: 'production',
  experiments: {
    outputModule: true,
  }
};

module.exports = [umd, esm];
