import 'reflect-metadata';
import { BadRequestException, Catch, type ArgumentsHost, type ExceptionFilter, HttpException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as helmetNs from 'helmet';
import cookieParser from 'cookie-parser';
import type { Request, Response } from 'express';
import { AppModule } from './app.module.js';

// `helmet`'s package.json exports dual ESM/CJS type declarations without an
// explicit `types` condition; under `moduleResolution: NodeNext` this lets
// the default-export type resolve inconsistently across environments (it
// type-checks locally but fails on Vercel's build). Resolving through the
// namespace import and asserting the callable shape sidesteps that resolver
// ambiguity instead of depending on it.
const helmet = ((helmetNs as { default?: unknown }).default ?? helmetNs) as (
  options?: Record<string, unknown>,
) => (req: Request, res: Response, next: (err?: unknown) => void) => void;

@Catch()
class ApiExceptionFilter implements ExceptionFilter {
  catch(exception:unknown,host:ArgumentsHost){const ctx=host.switchToHttp(),res=ctx.getResponse<Response>(),req=ctx.getRequest<Request&{id?:string;log?:{error:(details:unknown,message?:string)=>void}}>();const status=exception instanceof HttpException?exception.getStatus():500,raw=exception instanceof HttpException?exception.getResponse():null,obj=typeof raw==='object'&&raw?raw as any:{},err=exception instanceof Error?exception:new Error(String(exception));if(status===500)req.log?.error({err,requestId:req.id},'Unhandled API exception');const code=obj.code??(status===500?'INTERNAL_ERROR':exception instanceof HttpException?exception.name.replace(/Exception$/,'').toUpperCase():'INTERNAL_ERROR');const message=status===500?'An unexpected error occurred. Please try again.':obj.message??(typeof raw==='string'?raw:'Request failed'),details=status===500&&process.env.NODE_ENV!=='production'?{message:err.message}:obj.details;res.status(status).json({error:{code,message,requestId:req.id,details,messageHi:obj.messageHi}});}
}

async function bootstrap(){try{process.loadEnvFile(new URL('../../../.env',import.meta.url))}catch{/* .env is optional outside demo mode */}const production=process.env.NODE_ENV==='production',port=Number(process.env.PORT??4000),webOrigins=(process.env.WEB_ORIGIN??'http://localhost:3000').split(','),app=await NestFactory.create(AppModule,{bufferLogs:true,logger:production?undefined:['error','warn']});app.setGlobalPrefix('api/v1');
  // frame-ancestors must allow the web app's own origin(s) — the certificate
  // preview is embedded in an <iframe> there — while still blocking any
  // other site from framing these responses.
  app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'none'"],frameAncestors:["'self'",...webOrigins]}}}));app.use(cookieParser());app.enableCors({origin:webOrigins,credentials:true,methods:['GET','POST','PATCH','DELETE','OPTIONS'],allowedHeaders:['content-type','authorization','x-demo-admin','x-claim-csrf','x-request-id']});app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true,exceptionFactory:(errors)=>new BadRequestException({code:'VALIDATION_ERROR',message:'Request validation failed',details:errors})}));app.useGlobalFilters(new ApiExceptionFilter());const config=new DocumentBuilder().setTitle('Certificate Distribution API').setDescription('Secure Top 10 result, claim, export and retention APIs').setVersion('1.0').addBearerAuth().build();SwaggerModule.setup('api/docs',app,SwaggerModule.createDocument(app,config),{jsonDocumentUrl:'api/docs/openapi.json'});await app.listen(port,'0.0.0.0');if(!production)console.info(`API ready on http://localhost:${port}`);}
void bootstrap();
