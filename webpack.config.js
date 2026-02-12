const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const Dotenv = require('dotenv-webpack');

module.exports = {
  entry: {
    main: "./src/index.js",
  },
  output: {
    filename: "[name].bundle.js",
    path: path.resolve(__dirname, "dist"),
    clean: true, // Ensures old files are removed
    publicPath: "",
  },
  mode: "development", // production
  devServer: {
    static: {
      directory: path.resolve(__dirname, "dist"),
    },
    historyApiFallback: true, // Ensures proper routing
    hot: true,
    port: 3000,
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/preset-env"],
          },
        },
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.(png|jpg|gif|svg)$/,
        type: "asset/resource",
      },
      {
        test: /\.(mp4|mov)$/i,
        type: "asset/resource",
        generator: {
          filename: "videos/[name][ext]",
        },
      },
    ],
  },
  optimization: {
    usedExports: true, // Removes unused functions
  },
  plugins: [
    new Dotenv(),
    new CleanWebpackPlugin(),
    new HtmlWebpackPlugin({
      filename: "index.html", // Generates dist/index.html
      chunks: ["main"],
      template: "./pages/index.html",
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: "assets", to: "" },
        { from: "./pages/consent.html", to: "consent.html" },
        { from: "./pages/instructions.html", to: "instructions.html" },
        { from: "./pages/modal.html", to: "modal.html" },
        { from: "./pages/feedback.html", to: "feedback.html" },
        { from: "./styles/instruction.css", to: "instruction.css" },
        { from: "./styles/instructionPage2.css", to: "instructionPage2.css" },
        { from: "./styles/instructionPage4.css", to: "instructionPage4.css" },
        { from: "./styles/instructionPage6.css", to: "instructionPage6.css" },
        { from: "./styles/instructionPage8.css", to: "instructionPage8.css" },
      ],
    }),
  ],
};
