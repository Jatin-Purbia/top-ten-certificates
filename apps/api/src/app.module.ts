import { Module, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { AdminController, InternalController, PublicController } from './controllers.js';
import { Store } from './store.js';
import { ExportService } from './export.service.js';
import { AdminGuard, ClaimRateLimiter } from './security.js';

@Module({
  imports:[LoggerModule.forRoot({forRoutes:[{path:'{*path}',method:RequestMethod.ALL}],pinoHttp:{autoLogging:process.env.NODE_ENV==='production',genReqId:(req,res)=>{const existing=req.headers['x-request-id'];const id=typeof existing==='string'?existing:randomUUID();res.setHeader('x-request-id',id);return id;},redact:{paths:['req.headers.authorization','req.headers.cookie','req.body.claimCode','req.body.rows','res.headers["set-cookie"]'],censor:'[REDACTED]'},customProps:()=>({service:'certificate-api'})}})],
  controllers:[PublicController,AdminController,InternalController],
  providers:[Store,ExportService,ClaimRateLimiter,{provide:APP_GUARD,useClass:AdminGuard}]
})
export class AppModule{}
