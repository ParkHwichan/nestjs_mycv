# Section 11-3: 인증 가드(Auth Guard) 구현

## 개요

이번 섹션에서는 인증된 사용자만 접근할 수 있는 보호된 라우트를 구현하기 위해 `AuthGuard`를 생성하고 적용합니다. 가드는 요청이 컨트롤러 핸들러에 도달하기 전에 실행되어 인증 상태를 확인합니다.

## 구현 목적

### 문제점
- 모든 엔드포인트가 인증 없이 접근 가능합니다
- `whoami` 엔드포인트는 로그인한 사용자만 접근해야 합니다
- 세션이 없는 경우 적절한 오류 응답이 필요합니다

### 해결 방법
- **AuthGuard**: 인증 상태를 확인하는 가드 구현
- **@UseGuards 데코레이터**: 특정 엔드포인트에 가드 적용
- **세션 검증**: `session.userId`가 존재하는지 확인

## 구현된 기능

### 1. AuthGuard 생성
- `CanActivate` 인터페이스 구현
- 세션의 `userId` 존재 여부 확인
- `true` 반환 시 요청 허용, `false` 반환 시 요청 거부

### 2. 보호된 라우트
- `@UseGuards(AuthGuard)` 데코레이터로 특정 엔드포인트 보호
- 인증되지 않은 사용자는 자동으로 403 Forbidden 응답

### 3. CurrentUser 인터셉터와의 연동
- 가드가 통과한 후 인터셉터가 사용자 정보를 주입
- `@CurrentUser()` 데코레이터로 현재 사용자 접근

## 코드 구현

### 1. AuthGuard 생성

`src/guards/auth.guard.ts` 파일을 생성합니다:

```typescript
import { CanActivate, ExecutionContext } from "@nestjs/common";

export class AuthGuard implements CanActivate {
    canActivate(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest();
    
        return request.session.userId;
    }
}
```

### 코드 설명

#### 1. CanActivate 인터페이스
- NestJS의 가드 인터페이스입니다
- `canActivate` 메서드를 구현해야 합니다
- `boolean` 또는 `Promise<boolean>`을 반환합니다

#### 2. ExecutionContext
- 현재 실행 컨텍스트에 대한 정보를 제공합니다
- HTTP 요청, WebSocket 연결 등 다양한 컨텍스트를 처리할 수 있습니다
- `switchToHttp()`로 HTTP 컨텍스트로 전환합니다

#### 3. 세션 확인
```typescript
const request = context.switchToHttp().getRequest();
return request.session.userId;
```

- HTTP 요청 객체를 가져옵니다
- 세션의 `userId`가 존재하면 `true` (truthy 값), 없으면 `undefined` (falsy 값) 반환
- `true` 반환 시 요청이 컨트롤러 핸들러로 전달됩니다
- `false` 또는 `undefined` 반환 시 403 Forbidden 응답이 자동으로 반환됩니다

### 2. UsersController에 가드 적용

`src/users/users.controller.ts` 파일을 업데이트합니다:

```typescript
import { Body, Controller, Post, Get, Param, Query, Delete, Patch, Session, UseGuards} from '@nestjs/common';
import { CreateUserDto } from './dtos/create-user.dto';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dtos/update-user.dto';
import { NotFoundException } from '@nestjs/common';
import { Serialize } from 'src/interceptors/serialize.interceptor';
import { UserDto } from './dtos/user.dto';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { User } from './users.entity';
import { AuthGuard } from 'src/guards/auth.guard';

@Controller('auth')
@Serialize(UserDto)
export class UsersController {
    constructor(
        private usersService: UsersService,
        private authService: AuthService
    ) {}

    @Get('whoami')
    @UseGuards(AuthGuard)  // 가드 적용
    whoAmI(@CurrentUser() user: User) {
        return user;
    }

    // ... 기존 코드 ...
}
```

### 코드 설명

#### 1. UseGuards 데코레이터
```typescript
@Get('whoami')
@UseGuards(AuthGuard)
whoAmI(@CurrentUser() user: User) {
    return user;
}
```

- `@UseGuards(AuthGuard)`로 특정 엔드포인트에 가드를 적용합니다
- 가드는 핸들러가 실행되기 **전**에 실행됩니다
- 가드가 `false`를 반환하면 핸들러는 실행되지 않습니다

#### 2. 가드 실행 순서

```
요청 → 미들웨어 → 가드 → 인터셉터 → 핸들러 → 인터셉터 → 응답
```

1. **미들웨어**: 쿠키 세션 처리
2. **가드**: 인증 상태 확인 (`session.userId` 체크)
3. **인터셉터**: 사용자 정보 조회 및 주입 (`CurrentUserInterceptor`)
4. **핸들러**: 실제 비즈니스 로직 실행

#### 3. 가드와 인터셉터의 차이

| 구분 | 가드 (Guard) | 인터셉터 (Interceptor) |
|------|-------------|----------------------|
| **목적** | 인증/권한 확인 | 요청/응답 변환 |
| **실행 시점** | 핸들러 **전** | 핸들러 **전후** |
| **반환값** | `boolean` | `Observable` |
| **차단 가능** | ✅ 요청 차단 가능 | ❌ 요청 차단 불가 |
| **용도** | 인증, 권한 체크 | 로깅, 변환, 사용자 정보 주입 |

### 3. CurrentUser 인터셉터와의 연동

`CurrentUserInterceptor`는 가드가 통과한 후 실행되어 사용자 정보를 주입합니다:

```typescript
// src/users/interceptors/current-user.interceptor.ts
@Injectable()
export class CurrentUserInterceptor implements NestInterceptor {
    constructor(private usersService: UsersService) {}

    async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
        const request = context.switchToHttp().getRequest();
        const { userId } = request.session || {};

        if (userId) {
            const user = await this.usersService.findOne(userId);
            request.currentUser = user;
        }

        return next.handle();
    }
}
```

#### 실행 흐름

1. **가드 실행**: `session.userId`가 있는지 확인
2. **가드 통과**: `userId`가 있으면 `true` 반환
3. **인터셉터 실행**: `userId`로 사용자 정보 조회
4. **사용자 주입**: `request.currentUser`에 사용자 정보 저장
5. **핸들러 실행**: `@CurrentUser()` 데코레이터로 사용자 정보 접근

## 가드 동작 원리

### 1. 가드의 반환값 처리

#### Truthy 값 반환 (요청 허용)
```typescript
return request.session.userId;  // userId가 있으면 truthy
```

- `userId`가 존재하면 `true`로 평가됩니다
- 요청이 계속 진행됩니다
- 핸들러가 실행됩니다

#### Falsy 값 반환 (요청 거부)
```typescript
// session.userId가 없으면 undefined 반환
return undefined;  // falsy
```

- `undefined`, `null`, `false` 등 falsy 값 반환
- NestJS가 자동으로 **403 Forbidden** 응답을 반환합니다
- 핸들러는 실행되지 않습니다

### 2. 에러 응답 커스터마이징

현재는 기본 403 응답이 반환되지만, 커스텀 예외를 던질 수 있습니다:

```typescript
import { CanActivate, ExecutionContext, UnauthorizedException } from "@nestjs/common";

export class AuthGuard implements CanActivate {
    canActivate(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest();
    
        if (!request.session.userId) {
            throw new UnauthorizedException('You must be logged in');
        }
        
        return true;
    }
}
```

### 3. 전역 가드 적용

모든 엔드포인트에 가드를 적용하려면 `main.ts`에서 설정합니다:

```typescript
// main.ts
import { AuthGuard } from './guards/auth.guard';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalGuards(new AuthGuard());
  // ...
}
```

또는 모듈에서 설정:

```typescript
// users.module.ts
import { APP_GUARD } from '@nestjs/core';

@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class UsersModule {}
```

## 사용 예시

### 1. 보호된 엔드포인트 접근

#### 로그인한 사용자
```http
### 1. 로그인
POST http://localhost:3000/auth/signin
Content-Type: application/json

{
    "email": "test@test.com",
    "password": "123456"
}

### 2. whoami 접근 (성공)
GET http://localhost:3000/auth/whoami
```

**응답:**
```json
{
    "id": 1,
    "email": "test@test.com"
}
```

#### 로그인하지 않은 사용자
```http
### whoami 접근 (실패)
GET http://localhost:3000/auth/whoami
```

**응답:**
```
403 Forbidden
```

### 2. 공개 엔드포인트

가드를 적용하지 않은 엔드포인트는 누구나 접근 가능합니다:

```typescript
@Post('signup')
async createUser(@Body() body: CreateUserDto, @Session() session: any) {
    // 가드 없음 - 누구나 접근 가능
    const user = await this.authService.signup(body.email, body.password);
    session.userId = user.id;
    return user;
}
```

## 가드의 장점

### 1. 코드 재사용성
- 여러 엔드포인트에 동일한 인증 로직 적용
- 중복 코드 제거

### 2. 관심사 분리
- 인증 로직을 비즈니스 로직과 분리
- 핸들러는 비즈니스 로직에만 집중

### 3. 유지보수성
- 인증 로직 변경 시 가드만 수정
- 모든 보호된 엔드포인트에 자동 적용

### 4. 테스트 용이성
- 가드를 독립적으로 테스트 가능
- 모킹이 쉬움

## 가드 실행 순서 상세

### 전체 요청 처리 파이프라인

```
1. 미들웨어 (cookie-session)
   ↓
2. 가드 (AuthGuard)
   - session.userId 확인
   - 없으면 403 반환 (여기서 종료)
   - 있으면 다음 단계로
   ↓
3. 인터셉터 (CurrentUserInterceptor)
   - userId로 사용자 조회
   - request.currentUser에 저장
   ↓
4. 파이프 (ValidationPipe 등)
   ↓
5. 핸들러 (whoAmI)
   - @CurrentUser()로 사용자 접근
   ↓
6. 인터셉터 (응답 변환)
   ↓
7. 응답 반환
```

### 실제 실행 예시

#### 로그인한 사용자의 요청

```typescript
// 1. 가드 실행
canActivate(context) {
    const request = context.switchToHttp().getRequest();
    return request.session.userId;  // 1 (truthy) 반환
}
// ✅ 통과

// 2. 인터셉터 실행
intercept(context, next) {
    const { userId } = request.session;  // 1
    const user = await usersService.findOne(1);
    request.currentUser = user;  // 사용자 정보 저장
    return next.handle();
}

// 3. 핸들러 실행
whoAmI(@CurrentUser() user: User) {
    return user;  // 사용자 정보 반환
}
```

#### 로그인하지 않은 사용자의 요청

```typescript
// 1. 가드 실행
canActivate(context) {
    const request = context.switchToHttp().getRequest();
    return request.session.userId;  // undefined (falsy) 반환
}
// ❌ 차단 - 403 Forbidden 응답
// 인터셉터와 핸들러는 실행되지 않음
```

## 추가 개선 사항

### 1. 더 명확한 에러 메시지

```typescript
import { CanActivate, ExecutionContext, UnauthorizedException } from "@nestjs/common";

export class AuthGuard implements CanActivate {
    canActivate(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest();
    
        if (!request.session?.userId) {
            throw new UnauthorizedException('You must be logged in to access this resource');
        }
        
        return true;
    }
}
```

### 2. 의존성 주입 지원

가드도 서비스를 주입받을 수 있습니다:

```typescript
import { Injectable, CanActivate, ExecutionContext } from "@nestjs/common";
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(private usersService: UsersService) {}
    
    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const userId = request.session?.userId;
        
        if (!userId) {
            return false;
        }
        
        // 추가 검증: 사용자가 실제로 존재하는지 확인
        const user = await this.usersService.findOne(userId);
        return !!user;
    }
}
```

### 3. 역할 기반 접근 제어 (RBAC)

```typescript
@Injectable()
export class AdminGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const user = request.currentUser;
        
        return user?.role === 'admin';
    }
}

// 사용
@Get('admin')
@UseGuards(AuthGuard, AdminGuard)
adminOnly() {
    return 'Admin only';
}
```

## 테스트

### 1. 로그인 후 접근 테스트

```http
### 1. 로그인
POST http://localhost:3000/auth/signin
Content-Type: application/json

{
    "email": "test@test.com",
    "password": "123456"
}

### 2. 보호된 엔드포인트 접근
GET http://localhost:3000/auth/whoami
```

### 2. 로그인 없이 접근 테스트

```http
### 보호된 엔드포인트 접근 (실패 예상)
GET http://localhost:3000/auth/whoami
```

**예상 응답:**
```
403 Forbidden
```

## 관련 파일

- `src/guards/auth.guard.ts`: 가드 구현
- `src/users/users.controller.ts`: 가드 적용
- `src/users/interceptors/current-user.interceptor.ts`: 사용자 정보 주입 인터셉터
- `src/users/decorators/current-user.decorator.ts`: 현재 사용자 데코레이터

## 학습 포인트

### 1. 가드의 역할
- **인증 확인**: 사용자가 로그인했는지 확인
- **권한 확인**: 사용자가 특정 리소스에 접근할 권한이 있는지 확인
- **요청 차단**: 조건을 만족하지 않으면 요청을 차단

### 2. 가드 vs 인터셉터
- **가드**: 요청을 허용/거부 결정 (boolean 반환)
- **인터셉터**: 요청/응답 변환 (Observable 반환)

### 3. 실행 순서
- 미들웨어 → 가드 → 인터셉터 → 핸들러
- 각 단계에서 요청을 차단하거나 변환할 수 있습니다

## 다음 단계

- 역할 기반 접근 제어 (RBAC) 구현
- JWT 토큰 기반 인증으로 확장
- 여러 가드를 조합하여 복잡한 권한 체계 구현
- 가드 단위 테스트 작성

