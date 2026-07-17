FROM node:22-bookworm-slim

RUN npm install -g pnpm@9

ENV npm_config_update_notifier=false
WORKDIR /app
USER node

CMD ["bash"]
