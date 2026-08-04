# Minimal container for the Bazaar multiplayer relay.
# Most hosts inject $PORT; the server reads it (defaults to 8080).
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
EXPOSE 8080
CMD ["node", "server.js"]
