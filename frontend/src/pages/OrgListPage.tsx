import React, { useEffect } from 'react';
import { OrgList } from '../components/OrgList';
import type { OrgListPageProps } from '../types';

export const OrgListPage: React.FC<OrgListPageProps> = ({
  orgs,
  loading,
  onMount,
  hasMore,
  onLoadMore,
  loadingMore
}) => {
  useEffect(() => {
    onMount();
  }, [onMount]);

  return (
    <OrgList
      orgs={orgs}
      loading={loading}
      hasMore={hasMore}
      onLoadMore={onLoadMore}
      loadingMore={loadingMore}
    />
  );
};
export default OrgListPage;
