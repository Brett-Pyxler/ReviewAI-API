FROM node:20
ARG GIT_SHA
ENV GIT_SHA=${GIT_SHA}
RUN mkdir -p /srv
WORKDIR /srv
COPY . .
RUN npm ci
EXPOSE 3000
CMD [ "npm", "run", "listen"]