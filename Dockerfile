# Use the official Node.js LTS image
FROM node:20-alpine

# Set working directory inside the container
WORKDIR /app

# Copy only the package files first to leverage Docker layer caching
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy the rest of your source code
COPY . .

# Expose the port your app listens on (Cloud Run uses PORT env variable)
EXPOSE 8080

# Start the app using the environment port
CMD [ "node", "src/server.js" ]
