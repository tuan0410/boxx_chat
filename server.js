// A tiny chat server: one HTTP server (serves the page) + WebSockets (live messages).
const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;
const PASSWORD = process.env.CHAT_PASSWORD || ""; // optional: keeps strangers out
const history = []; // last 50 messages, kept in memory (lost on restart)

// 1) HTTP: send the chat page to anyone who opens the address
const server = http.createServer((req, res) => {
  fs.readFile(path.join(__dirname, "public", "index.html"), (err, data) => {
    if (err) {
      res.writeHead(500);
      return res.end("Could not load page");
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(data);
  });
});

// 2) WebSocket: a permanent two-way connection per person
const wss = new WebSocketServer({ server });

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === 1 && client.name) client.send(data);
  }
}

function sendUsers() {
  const users = [...wss.clients].filter((c) => c.name).map((c) => c.name);
  broadcast({ type: "users", users });
}

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let m;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }

    // First message must be "join"
    if (!ws.name) {
      if (m.type !== "join") return;
      if (PASSWORD && m.password !== PASSWORD) {
        ws.send(JSON.stringify({ type: "error", text: "Wrong password." }));
        return;
      }
      const name = String(m.name || "").trim().slice(0, 20);
      if (!name) {
        ws.send(JSON.stringify({ type: "error", text: "Enter a name." }));
        return;
      }
      ws.name = name;
      ws.send(JSON.stringify({ type: "joined", name }));
      ws.send(JSON.stringify({ type: "history", messages: history }));
      broadcast({ type: "system", text: `${name} joined` });
      sendUsers();
      return;
    }

    // After joining, accept chat messages
    if (m.type === "message") {
      const text = String(m.text || "").trim().slice(0, 1000);
      if (!text) return;
      const msg = { type: "message", name: ws.name, text, time: Date.now() };
      history.push(msg);
      if (history.length > 50) history.shift();
      broadcast(msg);
    }
  });

  ws.on("close", () => {
    if (ws.name) {
      broadcast({ type: "system", text: `${ws.name} left` });
      sendUsers();
    }
  });
});

server.listen(PORT, () => console.log(`Chat running on http://localhost:${PORT}`));
