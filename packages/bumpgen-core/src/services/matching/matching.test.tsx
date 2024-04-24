const { createMatchingService } = require('./index.ts');

describe('fuzzy', () => {
    const matchingService = createMatchingService();
    const { replacements: { fuzzy } } = matchingService;

    it('should return all messages if they fit within the budget', () => {
        const content = `import React from 'react';
        import { View } from 'react-native';
        import { observer } from 'mobx-react';
        import { useNavigation } from '@react-navigation/core';
        
        import ChannelBadges from '~/channel/badges/ChannelBadges';
        import UserModel from '~/channel/UserModel';
        import Link from '~/common/components/Link';
        import MPressable from '~/common/components/MPressable';
        import { Avatar, B1, Column, Row } from '~/common/ui';
        import Activity from '~/newsfeed/activity/Activity';
        import ActivityModel from '~/newsfeed/ActivityModel';
        import ThemedStyles from '~/styles/ThemedStyles';
        import { useTranslation } from '../../../locales';
        import BoostModel from '../../../models/BoostModelV3';
        import {
          BoostRejectionReason,
          BoostStatus,
          BoostTargetLocation,
        } from '../../types/BoostConsoleBoost';
        import BoostActionBar from './BoostActionBar';
        import BoostHeader from './BoostHeader';
        import GroupModel from '~/groups/GroupModel';
        import abbrev from '~/common/helpers/abbrev';
        
        interface BoostProps {
          boost: BoostModel;
        }
        
        const BoostEntity = ({ boost }: BoostProps) => {
          const { t } = useTranslation();
        
          if (!boost.entity) {
            return null;
          }
        
          switch (boost.entity.type) {
            case 'activity':
              return <ActivityBody boost={boost} />;
            case 'user':
              return <UserBody boost={boost} />;
            case 'group':
              return <GroupBody boost={boost} />;
            default:
              return (
                <B1 horizontal="L" vertical="L" color="secondary">
                  {t('Entity {{type}} {{subtype}} not supported', {
                    type: boost.entity.type,
                    subtype: boost.entity.subtype,
                  })}
                </B1>
              );
          }
        };
        
        const Rejection = ({ boost }: BoostProps) => {
          const { t } = useTranslation();
          const navigation = useNavigation();
          const wasWrongAudience =
            boost.rejection_reason === BoostRejectionReason.WRONG_AUDIENCE;
        
          return (
            <Column horizontal="L" bottom="L">
              <B1 font="bold">{t('Reason for rejection')}</B1>
              <B1>
                {t('Did not meet the acceptance criteria for the selected audience. ')}
                {wasWrongAudience ? (
                  <Link
                    onPress={() =>
                      navigation?.navigate('BoostScreenV2', {
                        entity: boost.entity,
                        boostType:
                          boost.target_location === BoostTargetLocation.newsfeed
                            ? 'post'
                            : 'channel',
                      })
                    }>
                    {t('Boost again.')}
                  </Link>
                ) : (
                  <Link url="https://support.minds.com/hc/en-us/articles/11723536774292-Boost-Content-Policy">
                    {t('Learn more')}
                  </Link>
                )}
              </B1>
            </Column>
          );
        };
        
        /**
         * Boost console item
         */
        function Boost({ boost }: BoostProps) {
          return (
            <View style={styles.container}>
              <BoostHeader boost={boost} />
              <BoostEntity boost={boost} />
              {boost.boost_status === BoostStatus.REJECTED ? (
                <Rejection boost={boost} />
              ) : (
                <BoostActionBar boost={boost} />
              )}
            </View>
          );
        }
        
        /**
         * Renders an activity inside the boost
         */
        const ActivityBody = ({ boost }: BoostProps) => {
          const navigation = useNavigation();
        
          if (!boost.entity) return null;
        
          const activity = ActivityModel.create(boost.entity);
          activity.goal_button_text = boost.goal_button_text;
          activity.goal_button_url = boost.goal_button_url;
        
          return (
            <Activity
              entity={activity}
              hideTabs={true}
              navigation={navigation}
              borderless
              hideMetrics={
                boost.boost_status === BoostStatus.APPROVED ||
                boost.boost_status === BoostStatus.COMPLETED
              }
            />
          );
        };
        
        /**
         * Renders a user inside the boost
         */
        const UserBody = ({ boost }: BoostProps) => {
          const navigation = useNavigation();
        
          if (!boost.entity) return null;
          const user = UserModel.create(boost.entity);
          return (
            <Column>
              <MPressable
                onPress={() =>
                  navigation.navigate('Channel', {
                    guid: user.guid,
                    entity: user,
                  })
                }>
                <Row vertical="M" horizontal="L" align="centerBoth">
                  <Avatar source={user.getAvatarSource()} size={'small'} />
                  <Column align="centerStart" left="M" flex>
                    <B1 font="bold">{user.name}</B1>
                    <B1>@{user.username}</B1>
                  </Column>
                  <ChannelBadges channel={user} />
                </Row>
              </MPressable>
              <Row horizontal="L" bottom="M">
                <B1 color="secondary">{user.briefdescription}</B1>
              </Row>
            </Column>
          );
        };
        
        /**
         * Renders a group inside the boost
         */
        const GroupBody = ({ boost }: BoostProps) => {
          const navigation = useNavigation();
        
          if (!boost.entity) return null;
          const group = GroupModel.create(boost.entity);
          return (
            <Column>
              <MPressable
                onPress={() =>
                  navigation.navigate('Group', {
                    guid: group.guid,
                    group: group,
                  })
                }>
                <Row vertical="M" horizontal="L" align="centerBoth">
                  <Avatar source={group.getAvatar().source} size={'small'} />
                  <Column align="centerStart" left="M" flex>
                    <B1 font="bold">{group.name}</B1>
                    <B1>{abbrev(group['members:count'])} members</B1>
                  </Column>
                </Row>
              </MPressable>
              <Row horizontal="L" bottom="M">
                <B1 color="secondary">{group.briefdescription}</B1>
              </Row>
            </Column>
          );
        };
        
        const styles = ThemedStyles.create({
          container: ['flexContainer', 'borderHair', 'bcolorPrimaryBorder'],
        });
        
        export default observer(Boost);`;
        const oldCode = `<Column align="centerStart" left='M' flex>
        <b1 font='bold'>{group.name}</b1>
        <b1>{abbrev(group["members:count"])} members</b1>
        </Column>`;
        const newCode = `SUCCESS`;

        const result = fuzzy({ content, oldCode, newCode });
        console.log(result);
    });
});