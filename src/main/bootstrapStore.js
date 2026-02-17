const fs = require("fs/promises");
const path = require("path");
const { app } = require("electron");

const BOOTSTRAP_FILE_NAME = "bootstrap-state.json";

function getBootstrapFilePath() {
  return path.join(app.getPath("userData"), BOOTSTRAP_FILE_NAME);
}

async function readBootstrapState() {
  const filePath = getBootstrapFilePath();

  try {
    const content = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeBootstrapState(nextState) {
  const filePath = getBootstrapFilePath();
  const content = JSON.stringify(nextState, null, 2);
  await fs.writeFile(filePath, content, "utf8");
  return nextState;
}

async function clearBootstrapState() {
  const filePath = getBootstrapFilePath();

  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

module.exports = {
  readBootstrapState,
  writeBootstrapState,
  clearBootstrapState,
};
