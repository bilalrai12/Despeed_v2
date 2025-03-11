const socketSpeed = require("./class/wsdeSpeed");
const chalk = require("chalk");
const { getRandomProxy, loadProxies } = require("./class/proxy");
const fs = require("fs");
const { logMessage } = require("./utils/logger");

async function main() {
  console.log(
    chalk.cyan(`
░█▀▄░█▀▀░█▀▀░█▀█░█▀▀░█▀▀░█▀▄
░█░█░█▀▀░▀▀█░█▀▀░█▀▀░█▀▀░█░█
░▀▀░░▀▀▀░▀▀▀░▀░░░▀▀▀░▀▀▀░▀▀░
  By : BILAL STUDIO 
 Telegram: https://t.me/Bilalstudio2
 Use it at your own risk
  `)
  );

  try {
    const token = fs
      .readFileSync("token.txt", "utf8")
      .split("\n")
      .filter((line) => line.trim());

    const uniqueToken = [...new Set(token.map((token) => token.trim()))];
    const count = uniqueToken.length;

    const proxiesLoaded = loadProxies();
    if (!proxiesLoaded) {
      logMessage(null, null, "Failed to load proxies", "error");
    }

    while (true) {
      logMessage(null, null, "Starting new process, Please wait...", "debug");

      const results = [];
      for (let i = 0; i < uniqueToken.length; i++) {
        const token = uniqueToken[i];
        try {
          const currentProxy = await getRandomProxy();
          const despeed = new socketSpeed(token, currentProxy, i + 1, count);

          const data = await despeed.getDataAccount();
          await despeed.processAccount();

          results.push({
            email: data.data.email,
            points: data.data.daily_earning || 0,
            seasonEarning: data.data.season_earning || 0,
            taskCompleted: despeed.taskCompleted,
            proxy: currentProxy,
            lastSpeedtestTime: despeed.lastSpeedtestTime || "N/A",
          });
        } catch (error) {
          logMessage(
            null,
            null,
            `Failed to process account: ${error.message}`,
            "error"
          );
          results.push({
            email: "N/A",
            points: 0,
            seasonEarning: 0,
            taskCompleted: 0,
            proxy: "N/A",
            lastSpeedtestTime: "N/A",
          });
        }
      }

      console.log("\n" + "═".repeat(70));
      results.forEach((result) => {
        logMessage(null, null, `Account: ${result.email}`, "success");
        logMessage(null, null, `Daily Points: ${result.points}`, "success");
        logMessage(
          null,
          null,
          `Total Points: ${result.seasonEarning}`,
          "success"
        );
        logMessage(
          null,
          null,
          `Tasks Completed: ${result.taskCompleted}`,
          "success"
        );
        logMessage(
          null,
          null,
          `Last Speedtest: ${result.lastSpeedtestTime}`,
          "success"
        );
        logMessage(null, null, `Proxy: ${result.proxy}`, "success");
        console.log("─".repeat(70));
      });

      logMessage(
        null,
        null,
        "Process completed, waiting for 1 hour",
        "success"
      );
      await new Promise((resolve) => setTimeout(resolve, 60 * 60 * 1000));
    }
  } catch (error) {
    logMessage(null, null, `Main process failed: ${error.message}`, "error");
  }
}

main();
                         
