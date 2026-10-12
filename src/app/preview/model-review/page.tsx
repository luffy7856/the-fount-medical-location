import type { Metadata } from 'next';
import ModelReview from '@/components/model-review';
export const metadata: Metadata = { title: '모델 검토 기록 | THE FOUNT', robots: { index: false, follow: false } };
export default function ReviewPage() { return <ModelReview />; }
