# Section 8: 데이터베이스 설정 및 TypeORM

## 개요

이번 섹션에서는 애플리케이션에서 일반 파일이 아닌 **진짜 데이터베이스 솔루션**을 사용하는 방법을 다룹니다.

## Nest와 데이터베이스 옵션

### 일반적인 접근

Nest로 데이터베이스 사용을 시작할 때는 2가지 일반 옵션이 있습니다.

**중요한 점:**
- Nest와 함께 쓰고 싶은 ORM, 데이터베이스라면 거의 뭐든지 사용할 수 있습니다
- 잘 작동될 테니까 특정 데이터베이스를 써야 하나 걱정할 필요가 없습니다
- 사용하고 싶은 거 아무 거나 쓰시면 됩니다

### 특히 Nest와 잘 작동하는 솔루션

설치가 필요 없으면서도 잘 작동하는 옵션이 2가지 있습니다:

#### 1. TypeORM
- 여러 다양한 데이터베이스와의 연결이 아주 원활합니다
- 기존의 SQL 타입 데이터베이스뿐만 아니라 **MongoDB 같은 NoSQL 타입도 잘 작동**합니다

#### 2. Mongoose
- **MongoDB와만 작동**합니다

## 이 과정에서의 선택

이 과정에서는 **TypeORM만 사용**합니다.

### TypeORM과 Nest의 관계

- TypeORM과 Nest를 붙여 놓으면 정말로 환상의 짝궁입니다
- 찰떡같이 서로 궁합이 잘 맞고 다방면에서 서로 지원합니다
- 예를 들어 TypeORM은 일부 분야에서는 좀 부족하고 사용하기 어려울 때도 있어요
- 하지만 Nest 안에는 TypeORM을 아주 원활히 사용할 수 있게 해주는 도구가 몇 가지 있습니다

## 데이터베이스 선택 전략

### 초기 단계: SQLite

**우선은 TypeORM을 활용하고, 함께 연결해서 실제 사용할 데이터베이스로는 SQLite 복사본을 활용합니다.**

이렇게 하는 이유:
- SQLite가 아주 사용하기 쉽고 시작하기 쉽기 때문입니다

### 최종 단계: PostgreSQL

하지만 차차 애플리케이션이 마무리되어 가면 SQLite를 좀 더 강력한 솔루션으로 교체할 예정입니다.

**결과적으로 이 애플리케이션에서는 TypeORM과 Postgres를 활용하게 됩니다.**

## 설치

터미널에서 다음 명령어로 TypeORM 관련 라이브러리를 설치합니다:

```bash
npm install @nestjs/typeorm typeorm sqlite3
```

### 설치하는 라이브러리 설명

1. **@nestjs/typeorm**
   - 이 라이브러리가 있으면 TypeORM과 Nest가 서로 잘 협력합니다
   - NestJS와 TypeORM을 통합하는 공식 패키지입니다

2. **typeorm**
   - TypeORM 라이브러리 자체입니다
   - ORM(Object-Relational Mapping) 프레임워크입니다

3. **sqlite3**
   - 우리가 사용하게 될 구체적인 데이터베이스 구현 형태입니다
   - SQLite 데이터베이스의 Node.js 드라이버입니다

### 향후 추가 설치

한참 후에는 다시 와서 Postgres 클라이언트도 설치할 예정입니다.
- 나중에 PostgreSQL로 전환할 때 다루겠습니다

## TypeORM과 Nest 통합

### 통합의 복잡성

방금 전에 TypeORM과 Nest를 연결하는 작업은 정말 간단하고 직관적이라고 말씀드렸지만, TypeORM과 Nest가 잘 협력하게 하려면 상당한 양의 코드를 작성해야 합니다.

**주의사항:**
- 코드를 많이 작성해야 되는 게 그리 큰 문제는 아닙니다
- 많은 양의 코드를 여기저기 서로 다른 위치에 배치하는 게 문제입니다
- 이 수많은 코드 조각들이 다 어떤 역할을 하는지 파악하는 게 헷갈릴 수 있습니다

### 앱 구조 다이어그램

TypeORM을 프로젝트에 통합하기 전에 아주 중요한 구조를 이해해야 합니다.

**현재 모듈 구조:**
- 앱을 생성할 때 자동으로 `AppModule`이라는 모듈 하나가 생성되었습니다
- 그 다음 `Users`와 `Reports`라는 모듈 2개를 더 생성했습니다

**TypeORM 통합 후 구조:**

1. **앱 모듈 내부에 데이터베이스 연결 생성**
   - 앱 모듈 내부에 SQLite 데이터베이스 연결을 생성합니다
   - 참고: SQLite가 아예 생소하다고 해도 전혀 문제 없습니다
   - 이 작업을 할 때 자동으로 사용자 모듈과 보고서 모듈도 이 연결을 공유하게 됩니다
   - 앱을 시작할 때 데이터베이스에 연결하는 이 한 번의 과정만으로 프로젝트의 모든 모듈로 다 퍼지면서 연결을 공유하게 됩니다

2. **엔터티 파일 생성**
   - 사용자 모듈과 보고서 모듈 내부에도 아주 특수한 파일 2개를 생성합니다
   - 이 파일을 **엔터티 파일**이라고 합니다

### 엔터티(Entity)의 개념

**엔터티는 거의 모든 프레임워크나 언어에서 말하는 모델과 아주 유사합니다** (몇 가지 사소한 예외는 있습니다).

**엔터티 파일의 역할:**
- 애플리케이션 내부에 저장하려는 리소스 중 하나의 종류만 정의합니다
- 예: 사용자 엔터티 = 사용자 리소스가 있는데, 이 사용자라는 종류의 자료를 데이터베이스 안에 저장하려는 것
- 엔터티 파일은 사용자나 보고서 모듈에서 필요할 것으로 예상되는 모든 속성을 열거합니다

**예시:**
- 사용자 엔터티에는 이메일이나 비밀번호 같은 것들이 있어야 합니다
- 엔터티 파일에는 문자열에 해당하는 이메일, 그리고 마찬가지로 문자열로 구성될 비밀번호를 넣어야 한다고 코드를 작성합니다
- 보고서 엔터티 파일에도 똑같은 내용을 입력해 넣습니다

### 리포지토리 자동 생성

**중요한 부분:**
- 이 엔터티 파일 2개를 생성하고 나서 Nest에 집어넣어 주면 보이지 않는 곳에서 Nest와 TypeORM이 협동해서 리포지토리, 즉 사용자 리포지토리와 보고서 리포지토리를 생성해줍니다
- TypeORM을 사용할 때는 이 부분이 아주 중요합니다
- 지난 앱에서처럼 리포지토리 파일을 수동으로 만들 필요가 없습니다
- 대신에 보이지 않는 곳에서 이 리포지토리들이 저절로 만들어집니다
- 생성된 파일을 확인하거나 할 필요조차 없습니다
- 이렇게 2개 클래스가 저절로 만들어질 것입니다

### 핵심 정리

1. **앱 모듈 내부에 연결을 설정하는 과정이 조금은 필요합니다**
2. **사용자 모듈 안에 사용자 엔터티를 생성**
3. **보고서 모듈 안에는 보고서 엔터티를 생성**
4. **그게 전부입니다**

## 코드 구현

### app.module.ts 수정

`src/app.module.ts` 파일을 다음과 같이 수정합니다:

```typescript
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    UsersModule, 
    ReportsModule, 
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'db.sqlite',
      entities: [],
      synchronize: true,
    })
  ],
  // ...
})
```

### 코드 설명

#### 1. TypeOrmModule 임포트

```typescript
import { TypeOrmModule } from '@nestjs/typeorm';
```

- `@nestjs/typeorm`에서 `TypeOrmModule`을 임포트합니다
- **주의**: `TypeOrmModule`에서 `rm`은 소문자입니다 (대문자 ORM으로 입력하지 않도록 주의)

#### 2. TypeOrmModule.forRoot() 설정

**이 메서드의 역할:**
- 이 SQLite 데이터베이스 연결을 설정하는 작업입니다
- `forRoot` 메서드 이름을 보면 알 수 있듯이, 이 연결은 자동으로 프로젝트 내부의 모든 모듈로 전달되어 공유됩니다

**구성 객체 속성:**

1. **type: 'sqlite'**
   - TypeORM은 여러 가지 종류의 데이터베이스와 융합이 잘 됩니다
   - 이 `type` 속성을 넣으면 SQLite 데이터베이스를 알아서 생성해달라고 말하는 것입니다

2. **database: 'db.sqlite'**
   - 데이터베이스에 이름을 붙여줍니다

3. **entities: []**
   - `entities` 배열을 추가하고 우선 지금은 공란으로 둡니다
   - 최종적으로 이 엔터티 배열에는 우리가 애플리케이션 안에 저장하려고 하는 것들을 전부 열거할 것입니다
   - 결과적으로 사용자 엔터티와 보고서 엔터티가 모두 들어가겠죠

4. **synchronize: true**
   - 나중에 `synchronize`의 의미를 좀 더 자세히 살펴볼 예정입니다
   - 일단은 이렇게 설정합니다

### 애플리케이션 실행

터미널에서 다음 명령어로 애플리케이션을 실행합니다:

```bash
npm run start:dev
```

**참고**: `npm run start:watch`가 아니라 `npm run start:dev`입니다.

## db.sqlite 파일 생성

애플리케이션이 실행되면 루트 프로젝트 디렉터리 안에 새 파일이 등록된 것을 볼 수 있습니다.

### SQLite 데이터베이스 파일

**`db.sqlite` 파일이 자동으로 생성됩니다.**

**SQLite의 특징:**
- SQLite는 **파일형 데이터베이스**입니다
- 즉, 데이터베이스와 관련된 모든 정보를 파일 하나에 저장한다는 뜻입니다
- 여기서 `database` 속성으로 `db.sqlite`를 넣었기 때문에 TypeORM이 SQLite를 통해 자동으로 프로젝트 루트 디렉터리 안에다 새 데이터베이스 파일을 생성해준 것입니다

### 데이터베이스 파일 활용

**이렇게 해서 정말 좋은 점:**
- 이제 이 파일을 열면 결국 이 안에서 데이터베이스의 원본 데이터를 볼 수 있게 됩니다
- 암호화되는 원본 데이터는 확실히 우리가 봐도 읽을 수 없겠지만
- 적어도 다양한 도구를 써서 이 안에 들어 있는 데이터를 쉽게 들여다볼 수 있게 됩니다
- 애플리케이션 내부를 실제로 개발해나가면서 여러 가지 다양한 도구를 이용해 해당 파일의 콘텐츠를 살펴볼 수 있고 이 안에서 애플리케이션의 데이터를 전부 확인할 수 있습니다

**결론:**
- SQLite를 지금의 개발 환경에서 사용하게 되면 결국에는 정말 도움이 많이 될 것입니다

## 엔터티 생성 및 구현

### User 엔터티 생성

`src/users/users.entity.ts` 파일을 생성합니다:

```typescript
import { AfterInsert, AfterUpdate, AfterRemove, Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class User {
    @PrimaryGeneratedColumn()
    id: number;
    
    @Column()
    email: string;
    
    @Column()
    password: string;

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
}
```

### 엔터티 데코레이터 설명

1. **@Entity()**
   - 클래스를 엔터티로 표시합니다
   - 이 클래스가 데이터베이스 테이블에 매핑됩니다

2. **@PrimaryGeneratedColumn()**
   - 기본 키(Primary Key)로 설정되고 자동 증가합니다
   - `id` 필드가 고유 식별자 역할을 합니다

3. **@Column()**
   - 일반 컬럼을 정의합니다
   - `email`, `password` 같은 일반 필드를 데이터베이스 컬럼에 매핑합니다

4. **@AfterInsert(), @AfterUpdate(), @AfterRemove()**
   - 엔터티 라이프사이클 훅(Lifecycle Hooks)입니다
   - 특정 이벤트 발생 시 자동으로 실행됩니다
   - 함수 이름은 개발자가 임의로 정할 수 있습니다

### app.module.ts에 엔터티 등록

`entities` 배열에 생성한 엔터티들을 등록합니다:

```typescript
import { User } from './users/users.entity';
import { Report } from './reports/reports.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'db.sqlite',
      entities: [User, Report],  // 엔터티 등록
      synchronize: true,
    })
  ],
})
```

## 모듈에 TypeORM 통합

### UsersModule 설정

`src/users/users.module.ts`에 `TypeOrmModule.forFeature()`를 추가합니다:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './users.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UsersService],
  controllers: [UsersController]
})
export class UsersModule {}
```

### TypeOrmModule.forFeature()의 역할

- 특정 모듈에서 사용할 엔터티를 등록합니다
- 이 모듈 내에서 해당 엔터티의 Repository를 주입받을 수 있게 해줍니다
- `forRoot()`는 전역 설정, `forFeature()`는 모듈별 설정입니다

## DTO (Data Transfer Object) 생성

### CreateUserDto 생성

`src/users/dtos/create-user.dto.ts` 파일을 생성합니다:

```typescript
import { IsEmail, IsString } from 'class-validator';

export class CreateUserDto {
    @IsEmail()
    email: string;
    
    @IsString()
    password: string;
}
```

### DTO의 역할

- 데이터 전송 객체로, 요청 데이터의 구조를 정의합니다
- `class-validator` 데코레이터를 사용하여 유효성 검사를 수행합니다
- `@IsEmail()`: 이메일 형식 검증
- `@IsString()`: 문자열 타입 검증

## 서비스에서 Repository 사용

### UsersService 구현

`src/users/users.service.ts` 파일을 다음과 같이 구현합니다:

```typescript
import { Injectable } from '@nestjs/common';
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
}
```

### Repository 주입 설명

1. **@InjectRepository(User)**
   - TypeORM의 Repository를 의존성 주입으로 가져옵니다
   - `User` 엔터티에 대한 Repository를 주입합니다

2. **Repository<User>**
   - TypeORM이 제공하는 Repository 타입입니다
   - 엔터티에 대한 CRUD 작업을 수행할 수 있는 메서드들을 제공합니다

### create() 메서드와 Hook의 관계

**중요한 점: `create()` 메서드를 사용하지 않으면 Hook이 작동하지 않습니다.**

#### 올바른 방법 (Hook 작동)

```typescript
create(email: string, password: string) {
    // 1. create() 메서드로 엔터티 인스턴스 생성
    const user = this.repo.create({ email, password });
    
    // 2. save()로 데이터베이스에 저장
    // 이렇게 하면 @AfterInsert() hook이 작동합니다
    return this.repo.save(user);
}
```

**작동 순서:**
1. `this.repo.create()`로 엔터티 인스턴스를 생성합니다
2. `this.repo.save(user)`로 저장하면 TypeORM이 엔터티 인스턴스를 인식합니다
3. 저장 후 `@AfterInsert()` hook이 자동으로 실행됩니다

#### 잘못된 방법 (Hook 작동 안 함)

```typescript
create(email: string, password: string) {
    // create() 없이 직접 save() 호출
    // 이렇게 하면 @AfterInsert() hook이 작동하지 않습니다!
    return this.repo.save({ email, password });
}
```

**문제점:**
- `create()` 없이 직접 `save()`를 호출하면 TypeORM이 일반 객체로 인식합니다
- 엔터티 인스턴스가 아니므로 라이프사이클 훅이 실행되지 않습니다

**정리:**
- Hook을 사용하려면 반드시 `this.repo.create()`를 먼저 호출해야 합니다
- `create()`는 엔터티 클래스의 인스턴스를 생성하므로 hook 메서드들이 함께 생성됩니다
- 그 후 `save()`를 호출하면 TypeORM이 엔터티 인스턴스를 인식하고 hook을 실행합니다

## 컨트롤러 구현

### UsersController 구현

`src/users/users.controller.ts` 파일을 다음과 같이 구현합니다:

```typescript
import { Body, Controller, Post } from '@nestjs/common';
import { CreateUserDto } from './dtos/create-user.dto';
import { UsersService } from './users.service';

@Controller('auth')
export class UsersController {
    constructor(private usersService: UsersService) {}

    @Post('signup')
    createUser(@Body() body: CreateUserDto) {
        return this.usersService.create(body.email, body.password);
    }
}
```

### 컨트롤러 설명

1. **@Controller('auth')**
   - 라우트 경로의 기본 경로를 설정합니다
   - `/auth`로 시작하는 모든 요청을 처리합니다

2. **@Post('signup')**
   - POST 메서드와 `/signup` 경로를 정의합니다
   - 최종 경로: `POST /auth/signup`

3. **@Body() body: CreateUserDto**
   - 요청 본문에서 데이터를 추출합니다
   - DTO를 사용하여 타입 안정성과 유효성 검사를 제공합니다

### API 엔드포인트

- **POST /auth/signup**
  - 새로운 사용자를 생성합니다
  - 요청 본문: `{ "email": "test@example.com", "password": "password123" }`
  - `@AfterInsert()` hook이 실행되어 콘솔에 로그가 출력됩니다

## 다음 단계

이번 영상에서는 많은 내용을 다뤘습니다. 여기서 잠시 쉬었다가 곧이어 TypeORM으로 넘어가보겠습니다.
