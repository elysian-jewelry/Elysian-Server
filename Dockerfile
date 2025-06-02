# Use Node.js LTS
FROM node:20

# Create app directory
WORKDIR /app

# Copy package files & install
COPY package*.json ./
RUN npm install

# Copy the rest of the app
COPY . .

# Set environment port
ENV PORT=8080

# Expose Cloud Run's port
EXPOSE 8080

# Start your app (adjust path if needed)
CMD ["node", "src/server.js"]
