import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface PaymentInfo {
  isPayment: boolean; // 결제 관련 이메일인지
  amount?: number; // 결제 금액
  currency?: string; // 통화 (KRW, USD, EUR 등)
  merchant?: string; // 결제처
  paymentDate?: string; // 결제일 (ISO 문자열)
  cardType?: string; // 카드 종류
  paymentType?: string; // 결제 유형
  category?: string; // 소비 카테고리 (food, grocery, transport, shopping, utilities, health, beauty, entertainment, travel, education, finance, subscription, gift, pet, other)
  summary?: string; // 요약
}

export interface FileData {
  type: 'base64' | 'url';
  data: string; // base64 데이터 또는 URL
  mimeType: string; // image/png, image/jpeg, application/pdf 등
  filename?: string; // 파일명
}

@Injectable()
export class OpenaiService {
  private openai: OpenAI;

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  /**
   * 이메일이 결제 관련인지 분석하고 정보 추출 (Vision API - 이미지/PDF 포함)
   */
  async analyzePaymentEmail(email: {
    from: string;
    subject: string;
    body: string;
    htmlBody?: string;
    files?: FileData[]; // 이미지 + PDF 파일들
  }): Promise<PaymentInfo> {
    const systemPrompt = `당신은 이메일 분석 전문가입니다. 결제/구매/청구 관련 이메일을 정확히 식별하고 정보를 추출합니다.
이메일 본문, 첨부된 이미지(영수증, 결제 내역 스크린샷), PDF 파일(청구서, 영수증)을 모두 분석해서 결제 정보를 추출하세요.
반드시 유효한 JSON 형식으로만 응답하세요.`;

    // HTML에서 텍스트 추출
    const extractedHtml = email.htmlBody ? this.extractTextFromHtml(email.htmlBody) : '';
    
    // 디버그 로그
    console.log(`\n[OpenAI] ========== 이메일 분석 시작 ==========`);
    console.log(`[OpenAI] 발신자: ${email.from}`);
    console.log(`[OpenAI] 제목: ${email.subject}`);
    console.log(`[OpenAI] 텍스트 본문 길이: ${email.body?.length || 0}자`);
    console.log(`[OpenAI] HTML 원본 길이: ${email.htmlBody?.length || 0}자`);
    console.log(`[OpenAI] HTML 추출 후 길이: ${extractedHtml.length}자`);
    if (extractedHtml) {
      console.log(`[OpenAI] HTML 추출 내용 (앞 500자):\n${extractedHtml.substring(0, 500)}`);
      if (extractedHtml.length > 500) {
        console.log(`[OpenAI] ... (${extractedHtml.length - 500}자 더 있음)`);
      }
    }
    console.log(`[OpenAI] ==========================================\n`);

    const textPrompt = `다음 이메일을 분석해서 결제/구매/청구 관련 이메일인지 판단하고, 결제 정보를 추출해주세요.
텍스트 본문, 이미지(영수증, 결제 내역), PDF 파일(청구서, 영수증)을 모두 확인하세요.

발신자: ${email.from}
제목: ${email.subject}

텍스트 본문:
${email.body?.substring(0, 3000) || '(본문 없음)'}

${extractedHtml ? `HTML 본문 (일부):
${extractedHtml.substring(0, 2000)}` : ''}

다음 JSON 형식으로 응답해주세요:
{
  "isPayment": true/false,  // 결제/구매/청구 관련 이메일인지
  "amount": 숫자 또는 null,  // 결제 금액 (숫자만, 통화 기호 제외)
  "currency": "KRW/USD/EUR/JPY 등 또는 null",  // 통화 코드 (ISO 4217)
  "merchant": "문자열 또는 null",  // 결제처/가맹점/서비스명
  "paymentDate": "YYYY-MM-DD 또는 null",  // 결제일
  "cardType": "문자열 또는 null",  // 카드 종류 (예: 신한카드, 삼성카드, Visa, Mastercard)
  "paymentType": "card_online/card_offline/subscription/autopay/transfer/mobile/other 또는 null",
  "category": "food/grocery/transport/shopping/utilities/health/beauty/entertainment/travel/education/finance/subscription/gift/pet/other 또는 null",  // 소비 카테고리
  "summary": "문자열"  // 아래 형식 참고
}

**summary 작성 가이드**:
- 결제 이메일: "[날짜]에 [장소/서비스]에서 [상품/내용]을 [금액]에 결제" 형식으로 간결하게
- 비결제 이메일: 핵심 내용 1-2문장 요약
예시: "12월 2일 스타벅스에서 아메리카노 2잔을 9,000원에 결제"

paymentType 분류 기준 (반드시 아래 값 중 하나만 사용):
- card_online: 온라인 카드결제 (쇼핑몰, 앱결제, 웹결제)
- card_offline: 오프라인 카드결제 (매장, POS, 대면결제)
- subscription: 정기구독 (Netflix, Spotify, 월정액 서비스)
- autopay: 자동이체 (통신비, 공과금, 보험료 자동납부)
- transfer: 계좌이체 (송금, 입금)
- mobile: 모바일결제 (카카오페이, 삼성페이, 애플페이, 페이코)
- other: 위 유형에 해당하지 않는 결제

카테고리 분류 기준 (반드시 아래 값 중 하나만 사용):
- food: 식비 (음식점, 배달, 카페, 베이커리)
- grocery: 장보기 (마트, 편의점, 식료품)
- transport: 교통 (택시, 버스, 지하철, 기차, 비행기, 주유, 톨비, 주차)
- shopping: 쇼핑 (의류, 신발, 잡화, 온라인쇼핑)
- utilities: 생활 (통신비, 전기, 가스, 수도, 관리비, 인터넷)
- health: 의료 (병원, 약국, 건강검진, 의료보험)
- beauty: 뷰티 (화장품, 미용실, 네일, 스파)
- entertainment: 문화 (영화, 공연, 전시, 게임, 스트리밍)
- travel: 여행 (숙박, 항공권, 렌터카, 여행상품)
- education: 교육 (학원, 강의, 도서, 자격증)
- finance: 금융 (이체, 대출이자, 수수료, 투자)
- subscription: 구독 (Netflix, Spotify, 멤버십, SaaS)
- gift: 선물 (선물, 경조사, 기부)
- pet: 반려동물 (사료, 동물병원, 용품)
- other: 위 카테고리에 해당하지 않는 경우

결제 관련이 아닌 경우에도 isPayment: false와 summary는 반드시 포함해주세요.
이미지나 PDF에서 발견한 결제 정보도 반드시 포함하세요.`;

    try {
      // 메시지 content 배열 구성
      const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
        { type: 'text', text: textPrompt },
      ];

      // 파일 추가 (이미지 + PDF, 최대 5개)
      const files = email.files?.slice(0, 5) || [];
      let imageCount = 0;
      let pdfCount = 0;

      for (const file of files) {
        if (file.mimeType.startsWith('image/')) {
          // 이미지 파일
          const imageUrl = file.type === 'url' 
            ? file.data 
            : `data:${file.mimeType};base64,${file.data}`;
          
          content.push({
            type: 'image_url',
            image_url: {
              url: imageUrl,
              detail: 'low',
            },
          });
          imageCount++;
        } else if (file.mimeType === 'application/pdf' && file.type === 'base64') {
          // PDF 파일 (base64로 전달)
          content.push({
            type: 'file',
            file: {
              filename: file.filename || 'document.pdf',
              file_data: `data:application/pdf;base64,${file.data}`,
            },
          } as any); // OpenAI 타입에 아직 file이 없을 수 있음
          pdfCount++;
        }
      }

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini', // Vision + PDF 지원 모델
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content },
        ],
        max_tokens: 1000,
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });

      const responseContent = response.choices[0]?.message?.content;
      if (!responseContent) {
        return { isPayment: false, summary: '분석 실패' };
      }

      const result = JSON.parse(responseContent) as PaymentInfo;
      
      console.log(`[OpenAI] Analyzed with ${imageCount} images, ${pdfCount} PDFs`);
      
      return {
        isPayment: result.isPayment ?? false,
        amount: result.amount ?? undefined,
        currency: result.currency ?? undefined,
        merchant: result.merchant ?? undefined,
        paymentDate: result.paymentDate ?? undefined,
        cardType: result.cardType ?? undefined,
        paymentType: result.paymentType ?? undefined,
        category: result.category ?? undefined,
        summary: result.summary ?? '요약 없음',
      };
    } catch (error) {
      console.error('[OpenAI] 분석 실패:', error.message);
      throw new Error(`이메일 분석 실패: ${error.message}`);
    }
  }

  /**
   * HTML에서 텍스트만 추출 (보수적 버전 - 내용 보존 우선)
   */
  private extractTextFromHtml(html: string): string {
    let text = html
      // 1. 내용 없는 태그만 제거 (head, style, script)
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      
      // 2. HTML 주석 제거
      .replace(/<!--[\s\S]*?-->/g, '')
      
      // 3. 줄바꿈 태그 → 실제 줄바꿈
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<\/table>/gi, '\n')
      
      // 4. 나머지 모든 태그 제거 (내용은 유지)
      .replace(/<[^>]+>/g, ' ')
      
      // 5. HTML 엔티티 디코딩
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num)))
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      
      // 6. 정리
      .replace(/[ \t]+/g, ' ') // 연속 공백/탭 → 공백 하나
      .replace(/\n[ \t]+/g, '\n') // 줄바꿈 뒤 공백 제거
      .replace(/[ \t]+\n/g, '\n') // 줄바꿈 앞 공백 제거
      .replace(/\n{3,}/g, '\n\n') // 3개 이상 줄바꿈 → 2개
      .trim();

    return text;
  }

  /**
   * 단순 이메일 요약 (결제 분석 없이)
   */
  async summarizeEmail(email: {
    from: string;
    subject: string;
    body: string;
  }): Promise<string> {
    const prompt = `다음 이메일을 한국어로 간단히 요약해주세요. 핵심 내용만 3-4문장으로 정리해주세요.

발신자: ${email.from}
제목: ${email.subject}

본문:
${email.body?.substring(0, 3000) || '(본문 없음)'}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: '당신은 이메일 요약 전문가입니다. 핵심 내용을 간결하게 요약해주세요.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_tokens: 500,
        temperature: 0.3,
      });

      return response.choices[0]?.message?.content || '요약을 생성할 수 없습니다.';
    } catch (error) {
      console.error('[OpenAI] 요약 실패:', error.message);
      throw new Error(`이메일 요약 실패: ${error.message}`);
    }
  }
}
