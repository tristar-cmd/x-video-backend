FROM node:18-slim

# Linux sistem güncellemelerini yapıp Python3 ve Ffmpeg'i kuruyoruz
RUN apt-get update && apt-get install -y python3 ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

CMD ["npm", "start"]
