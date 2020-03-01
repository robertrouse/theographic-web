import React, { useState } from 'react';
import { Link } from 'gatsby';
import PropTypes from 'prop-types';
import { useQuery } from '@apollo/react-hooks';
import gql from 'graphql-tag';

import { makeStyles } from '@material-ui/core/styles';
import { Typography, Container, Paper, InputBase, IconButton, LinearProgress, Tabs, Tab, Box, Button } from '@material-ui/core';
import { Search as SearchIcon, Cancel as CancelIcon, KeyboardArrowRight} from '@material-ui/icons';

import SearchHints from './SearchHints';
import PeopleCards from './PeopleCards';
import PlacesCards from './PlacesCards';
import VersesCards from './VersesCards';


function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <Typography
      component="div"
      role="tabpanel"
      hidden={value !== index}
      id={`search-results-${index}`}
      aria-labelledby={`search-results-${index}`}
      {...other}
    >
      <Box>{children}</Box>
    </Typography>
  );
}

TabPanel.propTypes = {
  children: PropTypes.node,
  index: PropTypes.any.isRequired,
  value: PropTypes.any.isRequired,
};

function a11yProps(index) {
  return {
    id: `search-results-${index}`,
    'aria-controls': `search-results-${index}`,
  };
}

export default function SearchPane() {

  const classes = useStyles();
  const [activeTab, setTab] = useState(0);
  const updateTabs = ( event, newTab ) => { setTab( newTab ) };
  const [searchInput, setSearch] = useState('');
  const searchUpdate = ( newInput = '' ) => { 
      setSearch( newInput) ;
      setTab( 0 );
    };

  const { loading, data } = useQuery(SEARCH_QUERY, { 
    variables: { "input": searchInput },
    skip: searchInput.length < 3,
  });

  const showVerses = (data && data.searchVerses.length > 0 && !loading);
  const showPeople = (data && data.searchPeople.length > 0 && !loading);
  const showPlaces = (data && data.searchPlaces.length > 0 && !loading);
  const showAll = (showVerses || showPeople || showPlaces);
  const showOne = [showVerses, showPeople, showPlaces].filter(Boolean).length === 1;
 
  const showNone = (searchInput.length > 2 && !showAll && !loading);

    return (
      <Container maxWidth="sm">
        <Paper elevation={3} className={classes.searchBar}>
          <div className={classes.searchIcon}><SearchIcon /></div>
          <InputBase
            className={classes.input}
            placeholder="Search the Bible"
            value={searchInput}
            inputProps={{ 'aria-label': 'Search the Bible' }}
            onChange={event => { searchUpdate(event.target.value); }}
          />
          {searchInput.length > 0 &&
            <IconButton 
              className={classes.iconButton}
              aria-label="clear" 
              onClick={() => { searchUpdate('') }} 
            >
              <CancelIcon/>
            </IconButton>
          }
        </Paper>
        <div>
          {loading && <LinearProgress color="secondary"/>}

          {showAll && !showOne &&
            <Box className={classes.results}>
              <Tabs 
                value={activeTab} 
                onChange={updateTabs} 
                aria-label="search results tabs"
                indicatorColor="primary"
                textColor="primary"
                variant="fullWidth"
              >
                <Tab label="All" {...a11yProps(0)} className={classes.tab} disableRipple />
                { showVerses && <Tab label="Verses" className={classes.tab} {...a11yProps(1)} disableRipple /> }
                { showPeople && <Tab label="People" className={classes.tab} {...a11yProps(2)} disableRipple /> }
                { showPlaces && <Tab label="Places" className={classes.tab} {...a11yProps(3)} disableRipple /> }
              </Tabs>
            </Box> 
          }
 

          {showNone &&
            <div className={classes.results}>
              <Typography>No results found.</Typography>
            </div>
          }

          { !showAll && !loading && 
            <Box className={classes.results}>
              <SearchHints searchUpdate={ searchUpdate } searchInput={ searchInput } />
            </Box> 
          }

{/* TODO: add method to fetch more on clicks below. */}
          <TabPanel value={activeTab} index={0} className={classes.results}>
            { showPeople && <PeopleCards people={data.searchPeople.slice(0,2)} /> }
            { showPeople && data.searchPeople[2] &&
              <Button disableRipple color = "primary" onClick = {() => {setTab(2)}}>
                More People<KeyboardArrowRight />
              </Button>
            }

            { showPlaces && <PlacesCards places={data.searchPlaces.slice(0,2)} /> }
            { showPeople && data.searchPlaces[2] &&
              <Button disableRipple color = "primary" onClick = {() => {setTab(3)}}>
                More Places<KeyboardArrowRight />
              </Button>
            }

            { showVerses && <VersesCards verses={data.searchVerses.slice(0,10)} /> }  
{/* This also has to go in the verses cards list to fetch more. */}
            { showPeople && 
              <Button disableRipple color = "primary" onClick = {() => {setTab(1)}}>
                More Verses<KeyboardArrowRight />
              </Button>
            }

          </TabPanel> 
          <TabPanel value={activeTab} index={1} className={classes.results}>
            { showVerses && <VersesCards verses={data.searchVerses} /> }   
            {/* TODO: add "more" button to show next 10 on click.*/}
          </TabPanel>
          <TabPanel value={activeTab} index={2} className={classes.results}>
            { showPeople && <PeopleCards people={data.searchPeople} /> }
            {/* TODO: remove limit when clicking this tab*/}
          </TabPanel>
          <TabPanel value={activeTab} index={3} className={classes.results}>
            { showPlaces && <PlacesCards places={data.searchPlaces} /> }
            {/* TODO: remove limit when clicking this tab*/}
          </TabPanel>
      </div>
      </Container>
    );
  }

const SEARCH_QUERY = gql`
query searchResults ($input:String!) {
    searchPeople(input:$input, first:3){
        name  
        verseCount
        slug
        verses(orderBy:verseId_asc, first:1){
            verseId
            fullRef
            osisRef
        }
    }
    searchPlaces(input:$input, first:3){
        name
        verseCount
        slug
        verses(orderBy:verseId_asc, first:1){
            verseId
            fullRef
            osisRef
        }
    }              
    searchVerses(input:$input, first:11){
        verseText  
        verseId
        fullRef
        osisRef
    }
}
`

const useStyles = makeStyles(theme => ({
  searchBar: {
    padding: '2px 4px',
    display: 'flex',
    alignItems: 'center',
    height: 45,
  },
  input: {
    marginLeft: theme.spacing(6),
    marginRight: theme.spacing(1),
    flex: 1,
  },
  iconButton: {
    padding: 10,
  },
  searchIcon: {
    width: theme.spacing(5),
    height: '100%',
    color: theme.palette.text.secondary,
    position: 'absolute',
    pointerEvents: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  results:{
    marginTop: theme.spacing(4),
  },
  tab:{
    minWidth:0,
  }
}));