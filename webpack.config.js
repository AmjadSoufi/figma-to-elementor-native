const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {
    code: './src/code.ts',
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  target: ['web', 'es2017'],
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
    iife: true,
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: './src/ui.html', to: './ui.html' },
      ],
    }),
  ],
};
