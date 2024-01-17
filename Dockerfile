FROM node:20
RUN mkdir -p /srv
WORKDIR /srv
COPY . .
RUN npm ci
EXPOSE 3000
CMD [ "npm", "run", "listen"]