# Section 10: 응답 데이터 직렬화 (Serialization) 구현

## 개요

이번 섹션에서는 API 응답 데이터를 안전하게 직렬화하는 기능을 구현합니다. 데이터베이스에서 반환되는 엔터티 객체(예: 비밀번호 포함)를 클라이언트에 전송하기 전에 DTO(Data Transfer Object)로 변환하여 민감한 정보를 제외하고 필요한 정보만 노출합니다.

## 구현 목적

### 문제점
- 데이터베이스 엔터티에는 비밀번호 같은 민감한 정보가 포함되어 있습니다
- 클라이언트에 모든 정보를 그대로 전송하면 보안 문제가 발생합니다
- 각 엔드포인트마다 수동으로 변환하는 것은 번거롭고 실수하기 쉽습니다

### 해결 방법
- 인터셉터(Interceptor)를 사용하여 응답 데이터를 자동으로 변환
- 커스텀 데코레이터를 만들어 간편하게 사용
- DTO를 사용하여 노출할 필드만 명시적으로 정의

## 구현된 기능

### 1. UserDto 생성
- 응답에 포함할 필드만 정의
- `@Expose()` 데코레이터로 노출할 필드 지정

### 2. SerializeInterceptor 구현
- 응답 데이터를 DTO로 자동 변환
- `excludeExtraneousValues: true`로 명시되지 않은 필드 제외

### 3. Serialize 데코레이터 생성
- 간편하게 인터셉터를 적용할 수 있는 커스텀 데코레이터
- 재사용 가능한 코드 작성

## 코드 구현

### UserDto 생성

`src/users/dtos/user.dto.ts` 파일을 생성합니다:

```typescript
import { Expose } from 'class-transformer';

export class UserDto {
    @Expose()
    id: number;
    
    @Expose()
    email: string;
}
```

### UserDto 설명

- **@Expose()**: `class-transformer`의 데코레이터로, 이 필드를 응답에 포함시킵니다
- **id, email만 포함**: 비밀번호는 포함하지 않아 보안을 유지합니다
- **excludeExtraneousValues**: `true`로 설정하면 `@Expose()`가 없는 필드는 자동으로 제외됩니다

### SerializeInterceptor 구현

`src/interceptors/serialize.interceptor.ts` 파일을 생성합니다:

```typescript
import {
    UseInterceptors,
    NestInterceptor,
    CallHandler,
    ExecutionContext,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { plainToInstance } from 'class-transformer';

interface ClassConstructor {
    new (...args: any[]): {};
}    

export function Serialize(dto: ClassConstructor) {
    return UseInterceptors(new SerializeInterceptor(dto));
}

export class SerializeInterceptor implements NestInterceptor {
    constructor(private dto: any) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        return next.handle().pipe(
            map((data: any) => {
                return plainToInstance(this.dto, data, {
                    excludeExtraneousValues: true,
                });
            })
        );
    }
}
```

### 코드 설명

#### 1. ClassConstructor 인터페이스
```typescript
interface ClassConstructor {
    new (...args: any[]): {};
}
```
- DTO 클래스의 타입을 정의합니다
- 생성자를 가진 클래스를 타입으로 지정합니다

#### 2. Serialize 데코레이터 함수
```typescript
export function Serialize(dto: ClassConstructor) {
    return UseInterceptors(new SerializeInterceptor(dto));
}
```
- **데코레이터 팩토리**: DTO를 인자로 받아 데코레이터를 반환합니다
- **UseInterceptors**: NestJS의 내장 데코레이터로 인터셉터를 등록합니다
- **재사용성**: 여러 엔드포인트에서 다른 DTO로 사용 가능합니다

#### 3. SerializeInterceptor 클래스
```typescript
export class SerializeInterceptor implements NestInterceptor {
    constructor(private dto: any) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        return next.handle().pipe(
            map((data: any) => {
                return plainToInstance(this.dto, data, {
                    excludeExtraneousValues: true,
                });
            })
        );
    }
}
```

**주요 구성 요소:**

- **NestInterceptor**: NestJS의 인터셉터 인터페이스를 구현합니다
- **constructor**: DTO 클래스를 주입받아 저장합니다
- **intercept()**: 인터셉터의 핵심 메서드입니다
  - `context`: 실행 컨텍스트 (요청 정보 포함)
  - `next`: 다음 핸들러를 호출하는 CallHandler
  - `Observable`: RxJS의 Observable을 반환합니다

**실행 흐름:**

1. `next.handle()`: 실제 핸들러(예: `findUser()`)를 실행합니다
2. `pipe(map(...))`: RxJS 연산자로 반환값을 변환합니다
3. `plainToInstance()`: 엔터티를 DTO 인스턴스로 변환합니다
4. `excludeExtraneousValues: true`: `@Expose()`가 없는 필드를 제외합니다

#### 4. plainToInstance 사용

**주의사항**: `plainToClass`는 deprecated되었으므로 `plainToInstance`를 사용합니다.

```typescript
// ❌ Deprecated
import { plainToClass } from 'class-transformer';
plainToClass(this.dto, data, { ... });

// ✅ 최신 방법
import { plainToInstance } from 'class-transformer';
plainToInstance(this.dto, data, { ... });
```

### UsersController에 적용

`src/users/users.controller.ts` 파일을 수정합니다:

```typescript
import { Serialize } from 'src/interceptors/serialize.interceptor';
import { UserDto } from './dtos/user.dto';

@Controller('auth')
@Serialize(UserDto)  // 클래스 레벨에 적용
export class UsersController {
    // ...
    
    @Get(':id')
    async findUser(@Param('id') id: string) {
        const user = await this.usersService.findOne(parseInt(id));
        if (!user) {
            throw new NotFoundException('user not found');
        }
        return this.usersService.findOne(parseInt(id));
    }

    @Get()
    findAllUsers(@Query('email') email: string) {
        return this.usersService.find(email);
    }
}
```

### 데코레이터 적용 위치

#### 클래스 레벨 적용
```typescript
@Controller('auth')
@Serialize(UserDto)  // 모든 메서드에 적용
export class UsersController { ... }
```

#### 메서드 레벨 적용
```typescript
@Serialize(UserDto)  // 특정 메서드에만 적용
@Get(':id')
async findUser() { ... }
```

## 작동 원리

### 1. 요청 처리 흐름

```
클라이언트 요청 (GET /auth/1)
    ↓
NestJS 라우팅
    ↓
SerializeInterceptor.intercept() 시작
    ↓
next.handle() 호출 → findUser() 실행
    ↓
findUser()가 User 엔터티 반환
    { id: 1, email: "test@test.com", password: "123456" }
    ↓
pipe(map(...)) 실행
    ↓
plainToInstance(UserDto, user, { excludeExtraneousValues: true })
    ↓
UserDto로 변환된 데이터 반환
    { id: 1, email: "test@test.com" }  // password 제외됨
    ↓
클라이언트에게 응답
```

### 2. 데이터 변환 과정

**변환 전 (User 엔터티):**
```json
{
  "id": 1,
  "email": "test@test.com",
  "password": "123456"
}
```

**변환 후 (UserDto):**
```json
{
  "id": 1,
  "email": "test@test.com"
}
```

### 3. 인터셉터의 감싸기 패턴

인터셉터는 핸들러를 감싸서 실행합니다:

```typescript
// 실제 실행 구조 (의사코드)
function wrappedHandler() {
    // 1. 인터셉터 시작
    const observable = next.handle();  // ← 실제 핸들러 실행
    
    // 2. 결과 변환
    return observable.pipe(
        map(data => transformToDto(data))
    );
}
```

## 데코레이터 이해하기

### 데코레이터 팩토리 패턴

```typescript
// 1. 데코레이터 팩토리 함수 정의
export function Serialize(dto: ClassConstructor) {
    return UseInterceptors(new SerializeInterceptor(dto));
}

// 2. 사용
@Serialize(UserDto)  // ← Serialize(UserDto) 함수 실행
async findUser() { ... }

// 3. 실제 변환
UseInterceptors(new SerializeInterceptor(UserDto))
async findUser() { ... }
```

### 데코레이터 vs 인터셉터

| 구분 | 데코레이터 | 인터셉터 |
|------|-----------|----------|
| **실행 시점** | 코드 로드 시 | 런타임 (요청 처리 시) |
| **역할** | 메타데이터 등록 | 실제 로직 실행 |
| **인자** | `target`, `propertyKey`, `descriptor` | `context`, `next` |
| **목적** | 설정/등록 | 요청/응답 변환 |

## 보안 개선 효과

### Before (직렬화 없이)
```typescript
@Get(':id')
async findUser(@Param('id') id: string) {
    const user = await this.usersService.findOne(parseInt(id));
    return user;  // ❌ password가 그대로 노출됨
}
```

**응답:**
```json
{
  "id": 1,
  "email": "test@test.com",
  "password": "123456"  // ⚠️ 보안 위험!
}
```

### After (직렬화 적용)
```typescript
@Serialize(UserDto)
@Get(':id')
async findUser(@Param('id') id: string) {
    const user = await this.usersService.findOne(parseInt(id));
    return user;  // ✅ 자동으로 DTO로 변환됨
}
```

**응답:**
```json
{
  "id": 1,
  "email": "test@test.com"  // ✅ password 제외됨
}
```

## 재사용성

### 다른 엔터티에도 적용 가능

```typescript
// ReportDto 생성
export class ReportDto {
    @Expose()
    id: number;
    
    @Expose()
    price: number;
}

// ReportsController에 적용
@Controller('reports')
@Serialize(ReportDto)
export class ReportsController {
    // ...
}
```

### 메서드별로 다른 DTO 사용

```typescript
@Controller('auth')
export class UsersController {
    @Serialize(UserDto)  // 이 메서드는 UserDto 사용
    @Get(':id')
    async findUser() { ... }
    
    @Serialize(UserSummaryDto)  // 이 메서드는 다른 DTO 사용
    @Get()
    async findAllUsers() { ... }
}
```

## 주요 개념 정리

### 1. 인터셉터 (Interceptor)
- 요청과 응답을 가로채서 변환할 수 있는 NestJS 기능
- `NestInterceptor` 인터페이스를 구현해야 함
- `intercept(context, next)` 메서드를 가져야 함

### 2. RxJS Observable
- 비동기 데이터 스트림을 처리하는 라이브러리
- `pipe()` 메서드로 연산자 체이닝 가능
- `map()` 연산자로 데이터 변환

### 3. class-transformer
- 일반 객체를 클래스 인스턴스로 변환
- `plainToInstance()`: 객체를 클래스 인스턴스로 변환
- `@Expose()`: 변환 시 포함할 필드 지정
- `excludeExtraneousValues`: 명시되지 않은 필드 제외

### 4. DTO (Data Transfer Object)
- 데이터 전송을 위한 객체
- 클라이언트와 서버 간 데이터 구조 정의
- 보안과 타입 안정성 제공

## 테스트

### API 요청 예시

```http
### 유저 조회
GET http://localhost:3000/auth/1
```

### 예상 응답

```json
{
  "id": 1,
  "email": "test@test.com"
}
```

비밀번호가 포함되지 않았는지 확인합니다.

## 다음 단계

이제 응답 데이터 직렬화가 완료되었습니다. 다음 섹션에서는:
- 인증(Authentication) 시스템 구현
- 비밀번호 해싱
- 세션 관리
- 가드(Guard)를 사용한 인가(Authorization)

등을 구현할 예정입니다.

