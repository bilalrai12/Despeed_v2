const axios = require("axios");
const { getProxyAgent } = require("./proxy");
const WebSocket = require("ws");
const UserAgent = require("user-agents");
const { logMessage } = require("../utils/logger");

class socketSpeed {
  constructor(token, proxy = null, currentNum, total) {
    this.currentNum = currentNum;
    this.total = total;
    this.token = token;
    this.proxy = proxy;
    this.baseUrl = "https://app.despeed.net";
    this.userEmail = null;
    this.eligible = null;
    this.lastSpeedtestTime = null;
    this.taskCompleted = null;
    this.email = null;
    this.axiosConfig = {
      ...(this.proxy && { httpsAgent: getProxyAgent(this.proxy) }),
      timeout: 120000,
    };
  }

  async makeRequest(method, url, config = {}, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        const userAgent = new UserAgent().toString();
        const headers = {
          "User-Agent": userAgent,
          ...config.headers,
        };
        const response = await axios({
          method,
          url,
          ...this.axiosConfig,
          ...config,
          headers,
        });
        return response;
      } catch (error) {
        logMessage(
          this.currentNum,
          this.total,
          `Request Failed ${error.message}`,
          "error"
        );
        logMessage(
          this.currentNum,
          this.total,
          `Retrying... (${i + 1}/${retries})`,
          "process"
        );
        await new Promise((resolve) => setTimeout(resolve, 12000));
      }
    }
    return null;
  }

  async getDataAccount() {
    const headers = {
      Authorization: `Bearer ${this.token}`,
      Origin: "https://app.despeed.net",
      Referer: "https://app.despeed.net/dashboard",
    };
    try {
      const response = await this.makeRequest(
        "GET",
        `${this.baseUrl}/v1/api/auth/profile`,
        { headers: headers }
      );
      if (response) {
        this.email = response.data.data.email;
        return response.data;
      } else {
        return false;
      }
    } catch (error) {
      logger.log(`{red-fg}Request failed: ${error.message}{/red-fg}`);
      return false;
    }
  }

  async dailyClaim() {
    const headers = {
      Authorization: `Bearer ${this.token}`,
      Origin: "https://app.despeed.net",
      Referer: "https://app.despeed.net/dashboard",
    };

    try {
      const response = await this.makeRequest(
        "POST",
        `${this.baseUrl}/v1/api/daily-claim`,
        { headers: headers }
      );
      if (response) {
        return response.data;
      }
      return false;
    } catch (error) {
      logMessage(
        this.currentNum,
        this.total,
        `Failed to update stats : ${error.message}`,
        "error"
      );
    }
  }

  async checkElig() {
    const headers = {
      Authorization: `Bearer ${this.token}`,
      Origin: "https://app.despeed.net",
      Referer: "https://app.despeed.net/dashboard",
    };

    const response = await this.makeRequest(
      "POST",
      `${this.baseUrl}/v1/api/speedtest-eligibility`,
      { headers: headers }
    );
    if (response) {
      this.taskCompleted = response.data.data.today.completed || 0;
      return response.data;
    } else {
      return false;
    }
  }

  async getLocation() {
    try {
      const response = await this.makeRequest("GET", `https://ipinfo.io/json`);
      if (response && response.data.loc) {
        const [latitude, longitude] = response.data.loc.split(",");
        return {
          city: response.data.city,
          region: response.data.region,
          country: response.data.country,
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
        };
      } else {
        throw new Error("Failed to get location data.");
      }
    } catch (error) {
      logMessage(
        this.currentNum,
        this.total,
        `Failed get location: ${error.message}`,
        "error"
      );
      return null;
    }
  }

  async performSpeedTest() {
    try {
      const response = await this.makeRequest(
        "GET",
        "https://locate.measurementlab.net/v2/nearest/ndt/ndt7"
      );
      if (response) {
        const server = response.data.results[0];
        const downloadUrl = server.urls["wss:///ndt/v7/download"];
        const downloadSpeed = await this.measureDownloadSpeed(downloadUrl);
        const uploadUrl = server.urls["wss:///ndt/v7/upload"];
        const uploadSpeed = await this.measureUploadSpeed(uploadUrl);
        logMessage(
          this.currentNum,
          this.total,
          `Download speed: ${downloadSpeed.toFixed(2)} Mbps`,
          "success"
        );
        logMessage(
          this.currentNum,
          this.total,
          `Upload speed: ${uploadSpeed.toFixed(2)} Mbps`,
          "success"
        );
        return { downloadSpeed, uploadSpeed };
      } else {
        return false;
      }
    } catch (error) {
      logMessage(
        this.currentNum,
        this.total,
        `Speedtest failed: ${error.message}`,
        "error"
      );
      return null;
    }
  }

  async measureDownloadSpeed(url) {
    return new Promise((resolve) => {
      const wsOptions = this.proxy
        ? { agent: getProxyAgent(this.proxy, this.currentNum, this.total) }
        : undefined;
      const ws = new WebSocket(url, "net.measurementlab.ndt.v7", wsOptions);
      let startTime = Date.now();
      let totalBytes = 0;
      ws.on("message", (data) => {
        if (typeof data === "string") return;
        totalBytes += data.length;
        const duration = (Date.now() - startTime) / 1000;
        if (duration >= 10) {
          ws.close();
          resolve((totalBytes * 8) / (duration * 1000000));
        }
      });
      ws.on("error", (error) => {
        logMessage(
          this.currentNum,
          this.total,
          `Request failed: ${error.message}`,
          "error"
        );
        resolve(0);
      });
    });
  }

  async measureUploadSpeed(url) {
    return new Promise((resolve) => {
      const wsOptions = this.proxy
        ? { agent: getProxyAgent(this.proxy, this.currentNum, this.total) }
        : undefined;
      const ws = new WebSocket(url, "net.measurementlab.ndt.v7", wsOptions);
      let startTime = Date.now();
      let totalBytes = 0;
      const uploadData = Buffer.alloc(32768);
      ws.on("open", () => {
        const sendData = () => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(uploadData);
            totalBytes += uploadData.length;
            const duration = (Date.now() - startTime) / 1000;
            if (duration >= 10) {
              ws.close();
              resolve((totalBytes * 8) / (duration * 1000000));
            } else {
              setImmediate(sendData);
            }
          }
        };
        sendData();
      });
      ws.on("error", (error) => {
        logMessage(
          this.currentNum,
          this.total,
          `Request failed: ${error.message}`,
          "error"
        );
        resolve(0);
      });
    });
  }

  async reportResults(downloadSpeed, uploadSpeed, location) {
    const headers = {
      Authorization: `Bearer ${this.token}`,
      Origin: "https://app.despeed.net",
      Referer: "https://app.despeed.net/dashboard",
    };
    const dataSend = {
      download_speed: downloadSpeed,
      upload_speed: uploadSpeed,
      latitude: location.latitude,
      longitude: location.longitude,
      timestamp: new Date().toISOString(),
    };
    try {
      const response = await this.makeRequest(
        "POST",
        `${this.baseUrl}/v1/api/points`,
        { headers: headers, data: dataSend }
      );
      if (response) {
        return response.data;
      } else {
        return false;
      }
    } catch (error) {
      logMessage(
        this.currentNum,
        this.total,
        `Failed to report results: ${error.message}`,
        "error"
      );
    }
  }

  async processAccount() {
    try {
      const daily = await this.dailyClaim();
      if (daily.message === "Daily claim successful! 🎉") {
        logMessage(
          this.currentNum,
          this.total,
          `Daily claim successful`,
          "success"
        );
      }

      logMessage(
        this.currentNum,
        this.total,
        `Checking eligibility for ${this.email}`,
        "process"
      );

      const elig = await this.checkElig();
      if (elig.data.isEligible === true) {
        logMessage(
          this.currentNum,
          this.total,
          `${this.email} Eligible For Speedtest`,
          "success"
        );
        const location = await this.getLocation();
        const { downloadSpeed, uploadSpeed } = await this.performSpeedTest();
        const reportSent = await this.reportResults(
          downloadSpeed,
          uploadSpeed,
          location
        );

        if (reportSent) {
          logMessage(
            this.currentNum,
            this.total,
            `Report sent successfully`,
            "success"
          );
        }

        this.lastSpeedtestTime = new Date().toLocaleString();
      } else {
        logMessage(
          this.currentNum,
          this.total,
          `${this.email} Not eligible`,
          "error"
        );
      }
    } catch (error) {
      logMessage(
        this.currentNum,
        this.total,
        `Error processing account: ${error.message}`,
        "error"
      );
    }
  }
}

module.exports = socketSpeed;
