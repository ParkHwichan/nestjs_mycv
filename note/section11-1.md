# Section 11-1: 인증(Authentication) 시스템 구현

## 개요

이번 섹션에서는 사용자 인증 시스템을 구현합니다. 비밀번호 해싱, 회원가입, 로그인, 세션 관리 기능을 추가하여 안전한 사용자 인증을 제공합니다.

## 구현 목적

### 문제점
- 평문 비밀번호를 데이터베이스에 저장하면 보안 위험이 발생합니다
- 사용자 로그인 상태를 관리할 방법이 필요합니다
- 회원가입 시 중복 이메일 체크가 필요합니다

### 해결 방법
- **비밀번호 해싱**: `scrypt` 알고리즘을 사용하여 비밀번호를 안전하게 저장
- **세션 관리**: `cookie-session`을 사용하여 로그인 상태 유지
- **인증 서비스**: 회원가입과 로그인 로직을 별도 서비스로 분리

## 구현된 기능

### 1. 비밀번호 해싱
- `scrypt` 알고리즘을 사용한 비밀번호 암호화
- Salt를 사용하여 같은 비밀번호라도 다른 해시값 생성
- Salt와 해시를 조합하여 저장 (`salt.hash` 형식)

### 2. 회원가입 (Signup)
- **엔드포인트**: `POST /auth/signup`
- 이메일 중복 체크
- 비밀번호 해싱 후 저장
- 자동 로그인 처리 (세션 생성)

### 3. 로그인 (Signin)
- **엔드포인트**: `POST /auth/signin`
- 이메일과 비밀번호 검증
- 해시된 비밀번호와 입력 비밀번호 비교
- 로그인 성공 시 세션 생성

### 4. 세션 관리
- **현재 사용자 확인**: `GET /auth/whoami`
- **로그아웃**: `GET /auth/signout`
- 쿠키 기반 세션 관리

## 코드 구현

### 1. AuthService 생성

`src/users/auth.service.ts` 파일을 생성합니다:

```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { randomBytes, scrypt as _scrypt } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(_scrypt);

@Injectable()
export class AuthService {
    constructor(private usersService: UsersService) {}

    async signup(email: string, password: string) {
        const users = await this.usersService.find(email);

        if (users.length > 0) {
            throw new BadRequestException('email in use');
        }
        
        const salt = randomBytes(8).toString('hex');
        const hash = (await scrypt(password, salt, 32)) as Buffer;
        
        const result = salt + '.' + hash.toString('hex');

        const user = await this.usersService.create(email, result);
        return user;
    }

    async signin(email: string, password: string) {
        const [user] = await this.usersService.find(email);

        if (!user) {
            throw new NotFoundException('user not found');
        }

        const [salt, storedHash] = user.password.split('.');
        const hash = (await scrypt(password, salt, 32)) as Buffer;
        
        if (storedHash !== hash.toString('hex')) {
            throw new BadRequestException('bad password');
        }

        return user;
    }
}
```

### 코드 설명

#### 1. scrypt 함수 promisify
```typescript
const scrypt = promisify(_scrypt);
```
- Node.js의 `crypto.scrypt`는 콜백 기반이므로 `util.promisify`로 Promise 기반으로 변환합니다

#### 2. signup 메서드
- **이메일 중복 체크**: `usersService.find(email)`로 기존 사용자 확인
- **Salt 생성**: `randomBytes(8)`로 8바이트 랜덤 salt 생성
- **비밀번호 해싱**: `scrypt(password, salt, 32)`로 32바이트 해시 생성
- **저장 형식**: `salt + '.' + hash` 형식으로 저장 (예: `abc123.def456...`)
- **사용자 생성**: 해시된 비밀번호로 사용자 생성

#### 3. signin 메서드
- **사용자 조회**: 이메일로 사용자 찾기
- **비밀번호 분리**: 저장된 비밀번호를 `.`으로 분리하여 salt와 hash 추출
- **비밀번호 검증**: 입력된 비밀번호를 같은 salt로 해싱하여 비교
- **예외 처리**: 사용자가 없거나 비밀번호가 틀리면 예외 발생

### 2. UsersController 업데이트

`src/users/users.controller.ts` 파일에 인증 관련 엔드포인트를 추가합니다:

```typescript
import { Body, Controller, Post, Get, Param, Query, Delete, Patch, Session } from '@nestjs/common';
import { CreateUserDto } from './dtos/create-user.dto';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dtos/update-user.dto';
import { NotFoundException } from '@nestjs/common';
import { Serialize } from 'src/interceptors/serialize.interceptor';
import { UserDto } from './dtos/user.dto';
import { AuthService } from './auth.service';

@Controller('auth')
@Serialize(UserDto)
export class UsersController {
    constructor(
        private usersService: UsersService,
        private authService: AuthService
    ) {}

    @Get('whoami')
    whoAmI(@Session() session: any) {
        return this.usersService.findOne(session.userId);
    }

    @Get('signout')
    signout(@Session() session: any) {
        session.userId = null;
        return 'I am signed out';
    }

    @Post('signup')
    async createUser(@Body() body: CreateUserDto, @Session() session: any) {
        const user = await this.authService.signup(body.email, body.password);
        session.userId = user.id;
        return user;
    }

    @Post('signin')
    async signin(@Body() body: CreateUserDto, @Session() session: any) {
        const user = await this.authService.signin(body.email, body.password);
        session.userId = user.id;
        return user;
    }

    // ... 기존 CRUD 엔드포인트들 ...
}
```

### 코드 설명

#### 1. Session 데코레이터
- `@Session()` 데코레이터로 세션 객체에 접근
- `session.userId`에 로그인한 사용자 ID 저장

#### 2. signup 엔드포인트
- `AuthService.signup()`으로 사용자 생성
- 생성 성공 시 `session.userId`에 사용자 ID 저장
- 자동으로 로그인 상태가 됩니다

#### 3. signin 엔드포인트
- `AuthService.signin()`으로 사용자 인증
- 인증 성공 시 `session.userId`에 사용자 ID 저장

#### 4. whoami 엔드포인트
- 현재 세션의 `userId`로 사용자 정보 조회
- 로그인하지 않은 경우 `null` 반환

#### 5. signout 엔드포인트
- `session.userId`를 `null`로 설정하여 로그아웃

### 3. UsersModule 업데이트

`src/users/users.module.ts` 파일에 `AuthService`를 추가합니다:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AuthService } from './auth.service';
import { User } from './users.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UsersService, AuthService],
  controllers: [UsersController]
})
export class UsersModule {}
```

### 4. Cookie Session 설정

`src/main.ts` 파일에 `cookie-session` 미들웨어를 추가합니다:

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
const cookieSession = require('cookie-session');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(
    cookieSession({
    keys: ['asdfasdf'],
  }))

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
  }));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

### 코드 설명

#### cookie-session 미들웨어
- **keys**: 쿠키를 암호화하는 키 배열
- **주의**: 프로덕션 환경에서는 환경 변수로 관리해야 합니다
- 모든 요청에 대해 세션 객체를 제공합니다

### 5. User 엔터티 업데이트

`src/users/users.entity.ts` 파일에서 비밀번호 필드에 `@Exclude()` 데코레이터를 추가합니다:

```typescript
import { AfterInsert, AfterUpdate, AfterRemove, Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { Exclude } from 'class-transformer';

@Entity()
export class User {
    @PrimaryGeneratedColumn()
    id: number;
    @Column()
    email: string;
    @Column()
    @Exclude()
    password: string;

    // ... 기존 코드 ...
}
```

### 코드 설명

- **@Exclude()**: `class-transformer`의 데코레이터로, 직렬화 시 이 필드를 제외합니다
- `UserDto`와 함께 사용하여 비밀번호가 응답에 포함되지 않도록 합니다

## 패키지 설치

### cookie-session 설치

```bash
npm install cookie-session
npm install --save-dev @types/cookie-session
```

## API 엔드포인트 요약

### 인증 관련 엔드포인트

1. **회원가입**
   - `POST /auth/signup`
   - 요청 본문: `{ "email": "test@test.com", "password": "123456" }`
   - 응답: 사용자 정보 (비밀번호 제외)

2. **로그인**
   - `POST /auth/signin`
   - 요청 본문: `{ "email": "test@test.com", "password": "123456" }`
   - 응답: 사용자 정보 (비밀번호 제외)

3. **현재 사용자 확인**
   - `GET /auth/whoami`
   - 세션에 저장된 사용자 정보 반환

4. **로그아웃**
   - `GET /auth/signout`
   - 세션 초기화

## 세션 작동 원리

### 1. cookie-session 미들웨어의 동작 방식

#### 요청 처리 흐름

1. **요청 수신**
   - 클라이언트가 HTTP 요청을 보낼 때, 쿠키가 `Cookie` 헤더에 포함되어 전달됩니다

2. **쿠키 복호화**
   ```typescript
   app.use(cookieSession({
     keys: ['asdfasdf'],
   }))
   ```
   - `cookie-session` 미들웨어가 `keys` 배열을 사용하여 쿠키를 복호화합니다
   - 복호화된 데이터를 `req.session` 객체로 변환합니다

3. **세션 객체 접근**
   ```typescript
   @Get('whoami')
   whoAmI(@Session() session: any) {
       return this.usersService.findOne(session.userId);
   }
   ```
   - NestJS의 `@Session()` 데코레이터가 `req.session` 객체를 주입합니다
   - 컨트롤러에서 `session.userId`와 같이 접근할 수 있습니다

4. **세션 수정**
   ```typescript
   session.userId = user.id;  // 세션에 데이터 저장
   session.userId = null;      // 세션 데이터 삭제
   ```
   - 세션 객체의 속성을 변경하면 자동으로 감지됩니다

5. **응답 전송**
   - 응답을 보낼 때, 변경된 세션 데이터가 암호화되어 `Set-Cookie` 헤더에 포함됩니다
   - 클라이언트(브라우저 또는 HTTP 클라이언트)가 쿠키를 저장합니다

### 2. REST Client에서의 쿠키 관리

#### 자동 쿠키 관리

VS Code의 **REST Client** 확장 프로그램은 쿠키를 자동으로 관리합니다:

1. **쿠키 수신**
   - 서버에서 `Set-Cookie` 헤더로 쿠키를 보내면 REST Client가 자동으로 저장합니다
   - 쿠키는 메모리나 임시 파일에 저장됩니다

2. **쿠키 자동 전송**
   - 같은 호스트(`localhost:3000`)로 요청을 보낼 때, 저장된 쿠키가 자동으로 `Cookie` 헤더에 포함됩니다
   - 별도의 설정 없이도 세션이 유지됩니다

3. **쿠키 저장 위치**
   - REST Client는 각 HTTP 파일별로 쿠키를 관리합니다
   - 같은 파일 내의 모든 요청이 쿠키를 공유합니다

#### 실제 동작 예시

```http
### 1. 회원가입 요청
POST http://localhost:3000/auth/signup
Content-Type: application/json

{
    "email": "test@test.com",
    "password": "123456"
}

### 응답: Set-Cookie 헤더
# Set-Cookie: express:sess=eyJ1c2VySWQiOjF9; path=/; httponly
# REST Client가 이 쿠키를 자동으로 저장

### 2. whoami 요청 (자동으로 쿠키 포함)
GET http://localhost:3000/auth/whoami

### 요청: Cookie 헤더 (자동 추가됨)
# Cookie: express:sess=eyJ1c2VySWQiOjF9
# 서버가 이 쿠키를 복호화하여 session.userId를 읽음
```

### 3. 쿠키 암호화 방식

#### keys 배열의 역할

```typescript
keys: ['asdfasdf']
```

- **암호화 키**: 쿠키의 내용을 암호화/복호화하는 데 사용됩니다
- **키 순환**: 여러 키를 제공하면 키 로테이션(순환)이 가능합니다
- **보안**: 키가 없으면 쿠키를 복호화할 수 없어 보안이 유지됩니다

#### 쿠키 구조

```
express:sess=<암호화된_세션_데이터>
```

- **이름**: `express:sess` (기본값)
- **값**: `{ userId: 1 }` 같은 세션 데이터가 암호화된 문자열
- **특징**: 암호화되어 있어 클라이언트에서 내용을 읽을 수 없습니다

### 4. 세션 데이터 흐름도

```
[클라이언트]                    [서버]
    |                              |
    | 1. POST /auth/signup         |
    |    (email, password)         |
    |--------------------------->  |
    |                              | 2. AuthService.signup()
    |                              |    → 사용자 생성
    |                              | 3. session.userId = user.id
    |                              | 4. 쿠키 암호화
    |                              |
    | 5. Set-Cookie 헤더           |
    |    (암호화된 세션)            |
    |<---------------------------  |
    |                              |
    | 6. 쿠키 저장 (자동)          |
    |                              |
    | 7. GET /auth/whoami          |
    |    Cookie 헤더 (자동 포함)    |
    |--------------------------->  |
    |                              | 8. 쿠키 복호화
    |                              | 9. session.userId 읽기
    |                              | 10. 사용자 정보 조회
    |                              |
    | 11. 사용자 정보 반환         |
    |<---------------------------  |
```

### 5. 브라우저 vs REST Client

#### 브라우저
- 쿠키를 자동으로 저장하고 관리합니다
- 같은 도메인으로 요청할 때 자동으로 쿠키를 포함합니다
- 개발자 도구에서 쿠키를 확인할 수 있습니다

#### REST Client
- 브라우저와 동일하게 쿠키를 자동으로 관리합니다
- HTTP 파일 내의 모든 요청이 쿠키를 공유합니다
- VS Code 확장 프로그램이 쿠키 저장소를 관리합니다

### 6. 세션 vs 쿠키

#### 세션 (Session)
- 서버 측에 저장되는 데이터 구조
- `req.session` 객체로 접근
- 메모리나 데이터베이스에 저장 가능

#### 쿠키 (Cookie)
- 클라이언트 측에 저장되는 작은 데이터
- HTTP 헤더를 통해 전송
- `cookie-session`은 세션 데이터를 쿠키에 암호화하여 저장

#### cookie-session의 장점
- 서버 측 저장소가 필요 없음 (메모리 효율적)
- 서버 재시작해도 쿠키가 유지됨 (단, 쿠키 만료 전까지)
- 확장성: 여러 서버 인스턴스 간 상태 공유 불필요

## 보안 고려사항

### 1. 비밀번호 해싱
- **scrypt 알고리즘**: 메모리 집약적이어서 브루트포스 공격에 강합니다
- **Salt 사용**: 레인보우 테이블 공격을 방지합니다
- **충분한 길이**: 32바이트 해시 사용

### 2. 세션 관리
- **쿠키 암호화**: `keys` 배열로 쿠키 암호화
- **프로덕션 환경**: `keys`는 환경 변수로 관리해야 합니다
- **HttpOnly 쿠키**: JavaScript에서 접근 불가 (기본 설정)
- **Secure 쿠키**: HTTPS에서만 전송 (프로덕션 권장)

### 3. 에러 메시지
- 구체적인 에러 메시지로 보안 정보 노출 최소화
- `BadRequestException`, `NotFoundException` 사용

## 테스트 방법

### 1. 회원가입 테스트

```http
POST http://localhost:3000/auth/signup
Content-Type: application/json

{
    "email": "test@test.com",
    "password": "123456"
}
```

### 2. 로그인 테스트

```http
POST http://localhost:3000/auth/signin
Content-Type: application/json

{
    "email": "test@test.com",
    "password": "123456"
}
```

### 3. 현재 사용자 확인

```http
GET http://localhost:3000/auth/whoami
```

### 4. 로그아웃

```http
GET http://localhost:3000/auth/signout
```

## 다음 단계

- 인증 가드(Guard) 구현으로 보호된 라우트 생성
- 권한 관리 시스템 구현
- JWT 토큰 기반 인증으로 확장

