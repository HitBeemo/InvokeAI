import {
  Flex,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
} from '@chakra-ui/react';
import { memo } from 'react';
import WorkflowGeneralTab from './WorkflowGeneralTab';
import WorkflowLinearTab from './WorkflowLinearTab';
import WorkflowJSONTab from './WorkflowJSONTab';

const WorkflowPanel = () => {
  return (
    <Flex
      layerStyle="first"
      sx={{
        flexDir: 'column',
        w: 'full',
        h: 'full',
        borderRadius: 'base',
        p: 4,
      }}
    >
      <Tabs
        variant="line"
        sx={{ display: 'flex', flexDir: 'column', w: 'full', h: 'full' }}
      >
        <TabList>
          <Tab>Linear</Tab>
          <Tab>Details</Tab>
          <Tab>JSON</Tab>
        </TabList>

        <TabPanels>
          <TabPanel>
            <WorkflowLinearTab />
          </TabPanel>
          <TabPanel>
            <WorkflowGeneralTab />
          </TabPanel>
          <TabPanel>
            <WorkflowJSONTab />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Flex>
  );
};

export default memo(WorkflowPanel);
