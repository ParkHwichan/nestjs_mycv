# Section 11-2: TypeScript 타입 오류 수정

## 개요

이번 섹션에서는 `AuthService.signin` 메서드에서 발생한 TypeScript 타입 오류를 수정합니다. `usersService.find()` 메서드가 배열을 반환하는데, TypeScript가 이를 제대로 추론하지 못하여 발생한 문제입니다.

## 발생한 오류

### 오류 내용

```
src/users/users.controller.ts:40:31 - error TS2339: Property 'id' does not exist on type 'User[]'.

40         session.userId = user.id;
                                 ~~
```

### 오류 원인

1. **`usersService.find()`의 반환 타입**: `Promise<User[]>` (배열)
2. **구조 분해 할당**: `const [user] = await this.usersService.find(email);`로 첫 번째 요소 추출
3. **TypeScript 추론 실패**: `signin` 메서드의 반환 타입이 `User[]`로 잘못 추론됨
4. **컨트롤러에서 오류**: `user.id` 접근 시 `User[]` 타입으로 인식되어 오류 발생

## 해결 방법

### 1. 명시적 반환 타입 추가

`signin` 메서드에 `Promise<User>` 반환 타입을 명시적으로 지정합니다.

### 2. User 엔터티 Import 추가

반환 타입을 지정하기 위해 `User` 엔터티를 import 합니다.

## 코드 수정

### AuthService 수정

`src/users/auth.service.ts` 파일을 다음과 같이 수정합니다:

```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './users.entity';  // 추가: User 타입 import
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

    // 수정: 명시적 반환 타입 추가
    async signin(email: string, password: string): Promise<User> {
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

### 변경 사항 요약

1. **Import 추가** (3번째 줄)
   ```typescript
   import { User } from './users.entity';
   ```

2. **반환 타입 명시** (29번째 줄)
   ```typescript
   async signin(email: string, password: string): Promise<User> {
   ```

## 코드 설명

### 1. 명시적 반환 타입의 필요성

#### 문제 상황

```typescript
async signin(email: string, password: string) {
    const [user] = await this.usersService.find(email);
    // ...
    return user;
}
```

- `usersService.find(email)`은 `Promise<User[]>`를 반환합니다
- 구조 분해 할당 `const [user] = ...`로 첫 번째 요소를 추출하지만
- TypeScript는 `signin` 메서드의 반환 타입을 `User[]`로 추론합니다
- 이는 `find()` 메서드의 반환 타입이 배열이기 때문입니다

#### 해결 방법

```typescript
async signin(email: string, password: string): Promise<User> {
    const [user] = await this.usersService.find(email);
    // ...
    return user;
}
```

- 명시적으로 `Promise<User>` 반환 타입을 지정합니다
- TypeScript가 올바른 타입으로 인식합니다
- 컨트롤러에서 `user.id` 접근이 정상적으로 작동합니다

### 2. 구조 분해 할당과 타입 추론

#### 구조 분해 할당

```typescript
const [user] = await this.usersService.find(email);
```

- `find()`는 `User[]` 배열을 반환합니다
- 구조 분해 할당으로 첫 번째 요소만 추출합니다
- `user`는 `User | undefined` 타입입니다 (배열이 비어있을 수 있음)

#### 타입 안전성

```typescript
if (!user) {
    throw new NotFoundException('user not found');
}
```

- `user`가 `undefined`인지 확인합니다
- 이후 코드에서 `user`는 `User` 타입으로 좁혀집니다 (Type Guard)

### 3. TypeScript 타입 추론의 한계

#### 자동 추론이 실패하는 경우

1. **복잡한 구조 분해**: 배열에서 요소를 추출할 때
2. **조건부 반환**: 여러 경로에서 다른 타입을 반환할 때
3. **제네릭 타입**: 복잡한 제네릭 타입 체인

#### 명시적 타입 지정의 장점

1. **타입 안전성**: 컴파일 타임에 오류 발견
2. **코드 가독성**: 의도가 명확하게 드러남
3. **IDE 지원**: 자동 완성과 타입 체크 향상

## 수정 전후 비교

### 수정 전

```typescript
// auth.service.ts
async signin(email: string, password: string) {
    const [user] = await this.usersService.find(email);
    // ...
    return user;
}

// users.controller.ts
async signin(@Body() body: CreateUserDto, @Session() session: any) {
    const user = await this.authService.signin(body.email, body.password);
    session.userId = user.id;  // ❌ 오류: Property 'id' does not exist on type 'User[]'
    return user;
}
```

### 수정 후

```typescript
// auth.service.ts
import { User } from './users.entity';  // ✅ 추가

async signin(email: string, password: string): Promise<User> {  // ✅ 반환 타입 명시
    const [user] = await this.usersService.find(email);
    // ...
    return user;
}

// users.controller.ts
async signin(@Body() body: CreateUserDto, @Session() session: any) {
    const user = await this.authService.signin(body.email, body.password);
    session.userId = user.id;  // ✅ 정상 작동
    return user;
}
```

## 타입 안전성 개선

### 추가 개선 사항 (선택적)

#### 1. signup 메서드에도 반환 타입 추가

일관성을 위해 `signup` 메서드에도 명시적 반환 타입을 추가할 수 있습니다:

```typescript
async signup(email: string, password: string): Promise<User> {
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
```

#### 2. UsersService 메서드의 반환 타입 명시

`UsersService`의 메서드들도 명시적 반환 타입을 추가하면 더욱 안전합니다:

```typescript
// users.service.ts
async findOne(id: number): Promise<User | null> {
    if (!id) {
        return null;
    }
    return this.repo.findOneBy({ id });
}

find(email: string): Promise<User[]> {
    return this.repo.find({ where: { email } });
}
```

## 테스트

### 컴파일 확인

```bash
npm run build
```

또는

```bash
npx tsc --noEmit
```

### 실행 확인

```bash
npm run start:dev
```

컴파일 오류가 해결되었는지 확인합니다.

## 학습 포인트

### 1. TypeScript 타입 추론의 한계

- TypeScript는 대부분의 경우 타입을 잘 추론하지만, 복잡한 경우에는 실패할 수 있습니다
- 구조 분해 할당, 제네릭, 조건부 타입 등에서 추론이 어려울 수 있습니다

### 2. 명시적 타입 지정의 중요성

- **가독성**: 코드를 읽는 사람이 의도를 쉽게 이해할 수 있습니다
- **안전성**: 컴파일 타임에 오류를 발견할 수 있습니다
- **유지보수**: 나중에 코드를 수정할 때 실수를 방지합니다

### 3. Best Practices

1. **공개 API**: 메서드나 함수의 반환 타입을 명시합니다
2. **복잡한 로직**: 타입 추론이 어려운 경우 명시적으로 지정합니다
3. **일관성**: 프로젝트 전체에서 일관된 스타일을 유지합니다

## 관련 파일

- `src/users/auth.service.ts`: 수정된 파일
- `src/users/users.controller.ts`: 오류가 발생했던 파일
- `src/users/users.service.ts`: `find()` 메서드가 정의된 파일
- `src/users/users.entity.ts`: `User` 엔터티 정의

## 다음 단계

- 다른 서비스 메서드들에도 명시적 반환 타입 추가 고려
- TypeScript strict 모드 활성화 검토
- 타입 가드와 타입 단언 활용 방법 학습

