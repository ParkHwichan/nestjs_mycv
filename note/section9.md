# Section 9: 사용자 CRUD API 구현

## 개요

이번 섹션에서는 사용자(User) 리소스에 대한 완전한 CRUD(Create, Read, Update, Delete) 기능을 구현합니다. Section 8에서 구현한 사용자 생성 기능을 확장하여 조회, 수정, 삭제 기능을 추가합니다.

## 구현된 기능

### 1. 사용자 생성 (Create)
- **엔드포인트**: `POST /auth/signup`
- **기능**: 새로운 사용자를 생성합니다
- **요청 본문**: `{ "email": "test@test.com", "password": "123456" }`

### 2. 사용자 조회 (Read)
- **단일 사용자 조회**: `GET /auth/:id`
- **사용자 목록 조회**: `GET /auth?email=test@test.com`

### 3. 사용자 수정 (Update)
- **엔드포인트**: `PATCH /auth/:id`
- **기능**: 기존 사용자 정보를 부분적으로 수정합니다

### 4. 사용자 삭제 (Delete)
- **엔드포인트**: `DELETE /auth/:id`
- **기능**: 사용자를 데이터베이스에서 삭제합니다

## 코드 구현

### UsersController 구현

`src/users/users.controller.ts` 파일에 모든 CRUD 엔드포인트를 구현했습니다:

```typescript
import { Body, Controller, Post, Get, Param, Query, Delete, Patch } from '@nestjs/common';
import { CreateUserDto } from './dtos/create-user.dto';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dtos/update-user.dto';
import { NotFoundException } from '@nestjs/common';

@Controller('auth')
export class UsersController {
    constructor(private usersService: UsersService) {}

    @Post('signup')
    createUser(@Body() body: CreateUserDto) {
        return this.usersService.create(body.email, body.password);
    }

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

    @Delete(':id')
    removeUser(@Param('id') id: string) {
        return this.usersService.remove(parseInt(id));
    }

    @Patch(':id')
    updateUser(@Param('id') id: string, @Body() body: UpdateUserDto) {
        return this.usersService.update(parseInt(id), body);
    }
}
```

### 컨트롤러 메서드 설명

#### 1. createUser() - 사용자 생성
- `@Post('signup')`: POST 메서드로 `/auth/signup` 경로 처리
- `@Body() body: CreateUserDto`: 요청 본문에서 DTO로 데이터 추출
- `CreateUserDto`를 사용하여 이메일과 비밀번호 유효성 검사

#### 2. findUser() - 단일 사용자 조회
- `@Get(':id')`: GET 메서드로 `/auth/:id` 경로 처리
- `@Param('id')`: URL 파라미터에서 id 추출
- 사용자가 존재하지 않으면 `NotFoundException` 발생
- `parseInt(id)`: 문자열 id를 숫자로 변환

#### 3. findAllUsers() - 사용자 목록 조회
- `@Get()`: GET 메서드로 `/auth` 경로 처리
- `@Query('email')`: 쿼리 파라미터에서 email 추출
- 이메일로 필터링하여 사용자 목록 반환

#### 4. removeUser() - 사용자 삭제
- `@Delete(':id')`: DELETE 메서드로 `/auth/:id` 경로 처리
- `@Param('id')`: URL 파라미터에서 id 추출

#### 5. updateUser() - 사용자 수정
- `@Patch(':id')`: PATCH 메서드로 `/auth/:id` 경로 처리
- `@Body() body: UpdateUserDto`: 요청 본문에서 업데이트 DTO로 데이터 추출
- 부분 업데이트를 위해 PATCH 메서드 사용

### UsersService 구현

`src/users/users.service.ts` 파일에 모든 비즈니스 로직을 구현했습니다:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './users.entity';

@Injectable()
export class UsersService {
    constructor(@InjectRepository(User) private repo: Repository<User>) {}

    create(email: string, password: string) {
        // Create a new user entity
        const user = this.repo.create({ email, password });

        // Save the user entity to the database
        return this.repo.save(user);
    }

    findOne(id: number) {
        return this.repo.findOneBy({ id });
    }

    find(email: string) {
        return this.repo.find({ where: { email } });
    }

    async update(id: number, attrs: Partial<User>) {
        const user = await this.findOne(id);
        if (!user) {
            throw new NotFoundException('user not found');
        }
        Object.assign(user, attrs);
        return this.repo.save(user);
    }

    async remove(id: number) {
        const user = await this.findOne(id);
        if (!user) {
            throw new NotFoundException('user not found');
        }
        return this.repo.remove(user);
    }
}
```

### 서비스 메서드 설명

#### 1. create() - 사용자 생성
- `this.repo.create()`: 엔터티 인스턴스 생성
- `this.repo.save()`: 데이터베이스에 저장
- `@AfterInsert()` hook이 자동 실행됨

#### 2. findOne() - 단일 사용자 조회
- `this.repo.findOneBy({ id })`: id로 사용자 조회
- TypeORM의 `findOneBy` 메서드 사용

#### 3. find() - 사용자 목록 조회
- `this.repo.find({ where: { email } })`: email로 필터링하여 조회
- 여러 사용자가 반환될 수 있음

#### 4. update() - 사용자 수정
- `async/await` 사용: 비동기 처리
- `findOne()`으로 사용자 존재 여부 확인
- 존재하지 않으면 `NotFoundException` 발생
- `Object.assign()`: 기존 사용자 객체에 새 속성 병합
- `this.repo.save()`: 수정된 사용자 저장
- `@AfterUpdate()` hook이 자동 실행됨

#### 5. remove() - 사용자 삭제
- `async/await` 사용: 비동기 처리
- `findOne()`으로 사용자 존재 여부 확인
- 존재하지 않으면 `NotFoundException` 발생
- `this.repo.remove()`: 사용자 삭제
- `@AfterRemove()` hook이 자동 실행됨

### UpdateUserDto 구현

`src/users/dtos/update-user.dto.ts` 파일을 생성하여 부분 업데이트를 위한 DTO를 구현했습니다:

```typescript
import { IsEmail, IsString, IsOptional } from 'class-validator';

export class UpdateUserDto {
    @IsEmail()
    @IsOptional()
    email: string;
    @IsString()
    @IsOptional()
    password: string;
}
```

### UpdateUserDto 설명

- **@IsOptional()**: 필드가 선택적임을 나타냅니다
- PATCH 요청에서는 모든 필드를 보낼 필요가 없으므로 `@IsOptional()` 데코레이터 사용
- `email`과 `password` 모두 선택적 필드로 설정
- 전송된 필드만 업데이트됩니다

### CreateUserDto (참고)

`src/users/dtos/create-user.dto.ts`:

```typescript
import { IsEmail, IsString } from 'class-validator';

export class CreateUserDto {
    @IsEmail()
    email: string;
    @IsString()
    password: string;
}
```

### CreateUserDto vs UpdateUserDto 차이점

- **CreateUserDto**: 모든 필드가 필수 (`@IsEmail()`, `@IsString()`)
- **UpdateUserDto**: 모든 필드가 선택적 (`@IsOptional()` 추가)
- PATCH 메서드는 부분 업데이트를 위해 설계되었으므로 모든 필드를 선택적으로 만듭니다

## API 테스트

### requests.http 파일

`src/users/requests.http` 파일에 모든 API 엔드포인트에 대한 테스트 요청을 추가했습니다:

```http
POST http://localhost:3000/auth/signup
Content-Type: application/json

{
    "email": "test@test.com",
    "password": "123456"
}

### 유저 조회
GET http://localhost:3000/auth/1

### 유저 목록 조회
GET http://localhost:3000/auth?email=test@test.com

### 유저 삭제
DELETE http://localhost:3000/auth/1

### 유저 업데이트
PATCH http://localhost:3000/auth/2
Content-Type: application/json

{
    "email": "test@test.com",
    "password": "1234256"
}
```

### HTTP 파일 형식 주의사항

**중요**: VS Code REST Client 확장을 사용할 때는 요청 구분자를 `###` (3개)로 사용해야 합니다.

- **올바른 형식**: `### 유저 조회` → Send Request 버튼이 표시됨
- **잘못된 형식**: `## 유저 조회` → Send Request 버튼이 표시되지 않음

`###` (3개)로 시작하는 주석은 REST Client에서 요청 구분자로 인식되며, 각 요청 위에 "Send Request" 버튼이 자동으로 생성됩니다.

## 엔터티 라이프사이클 훅

`src/users/users.entity.ts`에 구현된 훅들이 각 작업 시 자동으로 실행됩니다:

```typescript
@AfterInsert()
logInsert() {
    console.log('Inserted User with id', this.id);
}

@AfterUpdate()
logUpdate() {
    console.log('Updated User with id', this.id);
}

@AfterRemove()
logRemove() {
    console.log('Removed User with id', this.id);
}
```

### 훅 실행 시점

1. **@AfterInsert()**: `create()` 메서드로 사용자 생성 시 실행
2. **@AfterUpdate()**: `update()` 메서드로 사용자 수정 시 실행
3. **@AfterRemove()**: `remove()` 메서드로 사용자 삭제 시 실행

## 에러 처리

### NotFoundException

사용자가 존재하지 않을 때 `NotFoundException`을 발생시킵니다:

- `findUser()`: 사용자 조회 시 존재하지 않으면 에러 발생
- `update()`: 사용자 수정 시 존재하지 않으면 에러 발생
- `remove()`: 사용자 삭제 시 존재하지 않으면 에러 발생

### 에러 응답 예시

```json
{
  "statusCode": 404,
  "message": "user not found",
  "error": "Not Found"
}
```

## 라우팅 순서 주의사항

컨트롤러에서 라우트 순서가 중요합니다:

```typescript
@Get(':id')      // 동적 라우트
async findUser(@Param('id') id: string) { ... }

@Get()           // 정적 라우트
findAllUsers(@Query('email') email: string) { ... }
```

**주의**: `@Get(':id')`가 `@Get()`보다 먼저 정의되어 있으면, `/auth` 요청이 `:id` 라우트로 매칭될 수 있습니다.

**권장 순서**:
1. 구체적인 라우트를 먼저 정의
2. 동적 라우트(`:id`)를 나중에 정의

또는 반대로:
1. 동적 라우트(`:id`)를 먼저 정의
2. 쿼리 파라미터를 사용하는 정적 라우트를 나중에 정의

현재 구현에서는 `@Get(':id')`가 먼저 오고 `@Get()`이 나중에 오므로, `/auth` 요청은 `findAllUsers()`로 처리되고, `/auth/1` 요청은 `findUser()`로 처리됩니다.

## 완성된 API 엔드포인트 목록

| 메서드 | 경로 | 설명 | 요청 본문 |
|--------|------|------|-----------|
| POST | `/auth/signup` | 사용자 생성 | `{ "email": "...", "password": "..." }` |
| GET | `/auth/:id` | 단일 사용자 조회 | - |
| GET | `/auth?email=...` | 사용자 목록 조회 (이메일 필터) | - |
| PATCH | `/auth/:id` | 사용자 수정 | `{ "email": "...", "password": "..." }` (선택적) |
| DELETE | `/auth/:id` | 사용자 삭제 | - |

## 다음 단계

이제 사용자 리소스에 대한 완전한 CRUD 기능이 구현되었습니다. 다음 섹션에서는:
- 비밀번호 암호화 (해싱)
- 인증 및 인가 시스템
- 세션 관리
- 기타 보안 기능

등을 구현할 예정입니다.

