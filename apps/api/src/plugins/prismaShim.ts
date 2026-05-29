import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

/** prismaShim plugin */
const plugin: FastifyPluginAsync = async (app) => {
  app.log.info('prismaShim plugin registered');
};

export default fp(plugin, { name: 'prismaShim' });
