$services = @("auth-service", "catalog-service", "seats-service", "bookings-service", "payments-service", "otp-service")

foreach ($svc in $services) {
    Set-Location "E:\CinemaSeat\services\$svc"
    npm init -y
    npm install express pg cors dotenv
    Set-Content "Dockerfile" @"
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["node", "src/index.js"]
"@
}
