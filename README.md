# EdTech LMS API

A comprehensive Learning Management System API built with NestJS, designed for educational technology applications. This API provides a robust backend for managing educational content, student progress, assessments, and more.

## 🚀 Features

- **User Management**: Authentication, authorization, and role-based access control
- **Course Management**: Create and manage courses, lessons, and educational content
- **Student Progress Tracking**: Monitor student learning progress and performance
- **Assessment System**: Quizzes, tests, and evaluation tools
- **File Management**: Upload and manage educational resources with AWS S3 integration
- **Multi-tenant Support**: Support for multiple schools and organizations
- **RESTful API**: Well-documented API with Swagger/OpenAPI documentation
- **Database Migrations**: Sequelize-based database management
- **Email Integration**: SMTP support for notifications and communications

## 🛠️ Technology Stack

- **Framework**: NestJS (Node.js)
- **Database**: MySQL with Sequelize ORM
- **Authentication**: JWT (JSON Web Tokens)
- **File Storage**: AWS S3
- **Email**: SMTP integration
- **Documentation**: Swagger/OpenAPI
- **Language**: TypeScript

## 📋 Prerequisites

- Node.js (v14 or higher)
- MySQL database (v5.7 or higher)
- AWS S3 bucket (for file storage)
- SMTP server (for email functionality)

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/edtech-lms-api.git
cd edtech-lms-api
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

Copy the example environment file and configure your settings:

```bash
cp env.example .env
```

Edit `.env` with your configuration:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_NAME=edtech_lms
DB_USER=your-db-user
DB_PASSWORD=your-db-password

# JWT Configuration
APPLICATION_SECRET=your-jwt-secret-here

# AWS Configuration
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_S3_BUCKET=your-s3-bucket-name

# SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-email-password
```

### 4. Database Setup

Create your MySQL database and run migrations:

```bash
npm run db:migrate
```

### 5. Start the Development Server

```bash
npm run start:dev
```

The API will be available at `http://localhost:3000`

## 📚 API Documentation

Once the server is running, you can access the Swagger documentation at:
- Development: `http://localhost:3000/api`

## 🗂️ Project Structure

```
src/
├── business/          # Business logic services
├── config/           # Configuration files
├── db/              # Database models and migrations
├── decorators/      # Custom decorators
├── filters/         # Exception filters
├── guards/          # Authentication guards
├── interceptors/    # Request/response interceptors
├── middlewares/     # Custom middlewares
├── models/          # Data models and interfaces
├── modules/         # Feature modules
├── pipes/           # Validation pipes
├── services/        # Core services
└── validators/      # Input validation schemas
```

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run e2e tests
npm run test:e2e

# Run test coverage
npm run test:cov
```

## 🏗️ Building for Production

```bash
# Build the application
npm run build

# Start production server
npm run start:prod
```

## 📝 Available Scripts

- `npm run start` - Start the application
- `npm run start:dev` - Start in development mode with hot reload
- `npm run start:debug` - Start in debug mode
- `npm run build` - Build the application
- `npm run test` - Run unit tests
- `npm run test:e2e` - Run end-to-end tests
- `npm run test:cov` - Run tests with coverage
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier
- `npm run db:migrate` - Run database migrations

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details on how to contribute to this project.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

If you encounter any issues or have questions:

1. Check the [Issues](https://github.com/your-username/edtech-lms-api/issues) page
2. Create a new issue if your problem isn't already reported
3. Join our community discussions

## 🙏 Acknowledgments

- Built with [NestJS](https://nestjs.com/)
- Database management with [Sequelize](https://sequelize.org/)
- Documentation with [Swagger](https://swagger.io/)