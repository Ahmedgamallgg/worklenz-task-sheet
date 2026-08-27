import React from 'react';
import { Select } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

interface RateCardAssigneeSelectorProps {
  projectId: string;
  selectedMemberIds: string[];
  onChange: (memberId: string) => void;
  memberlist: any[];
  assignedMembers?: any[];
}

export const RateCardAssigneeSelector: React.FC<RateCardAssigneeSelectorProps> = ({
  selectedMemberIds,
  onChange,
  memberlist = [],
}) => {
  return (
    <Select
      size="small"
      placeholder={<PlusOutlined />}
      style={{ width: 120 }}
      onChange={onChange}
      value={undefined}
      options={memberlist.map(m => ({
        label: m.name,
        value: m.id,
        disabled: selectedMemberIds.includes(m.id),
      }))}
    />
  );
};

export default RateCardAssigneeSelector;
