import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
const cookieSession = require('cookie-session');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  
  // CORS 설정 추가
  app.enableCors({
    origin: (origin : any, callback : any) => {
      callback(null, true);  // 어떤 Origin이 와도 허용
    },
    credentials: true,
  });

  app.use(
    cookieSession({
      keys: [configService.get('SESSION_SECRET', 'default-secret-change-me')],
      secure: false, // 개발 환경에서는 HTTPS 아니어도 가능
      httpOnly: true, // 쿠키를 HTTP 전용으로 설정
    })
  );

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
  }));

  // Swagger 설정
  const config = new DocumentBuilder()
    .setTitle('MyCv API')
    .setDescription('이메일 결제 분석 API')
    .setVersion('1.0')
    .addTag('auth', '인증')
    .addTag('google', 'Gmail 연동')
    .addTag('email-analysis', '이메일 분석 및 결제 리포트')
    .addCookieAuth('session')
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = configService.get('PORT', 3000);
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`Swagger UI: http://localhost:${port}/api`);
}
bootstrap();
