export const formatHumanAge = (lastRelease: string | null): string => {
	if (lastRelease === null) {
		return 'N/A';
	}
	const now = new Date();
	const date = new Date(lastRelease);
	const diffTime = Math.abs(now.getTime() - date.getTime());
	const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
	const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

	if (diffHours < 1) {
		return 'just now';
	}
	if (diffHours < 24) {
		return `${diffHours}h`;
	}
	if (diffDays < 30) {
		return `${diffDays}d`;
	}
	const months = Math.floor(diffDays / 30);
	if (months < 12) {
		return `${months}m`;
	}
	const years = Math.floor(diffDays / 365);
	return `${years}y`;
};

export const isMajorUpdate = (current: string, latest: string | null): boolean => {
	if (latest === null || current === latest) {
		return false;
	}
	const [currentMajor = ''] = current.split('.');
	const [latestMajor = ''] = latest.split('.');
	return currentMajor !== latestMajor;
};
