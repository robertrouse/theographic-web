import React, { useState} from 'react';
import PropTypes from 'prop-types';
import { useQuery } from '@apollo/react-hooks';
import gql from 'graphql-tag';

import { makeStyles } from '@material-ui/core/styles';
import { Typography, Container, Paper, InputBase, IconButton, LinearProgress, AppBar, Tabs, Tab, Box } from '@material-ui/core';
import { Search as SearchIcon, Cancel as CancelIcon} from '@material-ui/icons';

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

          {showAll && <AppBar position="static">
            <Tabs 
              value={activeTab} 
              onChange={updateTabs} 
              aria-label="search results tabs"
            >
              <Tab label="All" {...a11yProps(0)} />
              { showVerses && <Tab label="Verses" {...a11yProps(1)} /> }
              { showPlaces && <Tab label="People" {...a11yProps(2)} /> }
              { showPlaces && <Tab label="Places" {...a11yProps(3)} /> }
            </Tabs>
          </AppBar> }
 

          {showNone &&
            <div className={classes.results}>
              <Typography>No results found.</Typography>
            </div>
          }

          { !showAll && !loading && <SearchHints searchUpdate={ searchUpdate } searchInput={ searchInput }></SearchHints> }

          <TabPanel value={activeTab} index={0} className={classes.results}>
            { showPeople && <PeopleCards people={data.searchPeople}></PeopleCards> }
            { showPlaces && <PlacesCards places={data.searchPlaces}></PlacesCards> }
            { showVerses && <VersesCards verses={data.searchVerses}></VersesCards> }   
          </TabPanel> 
          <TabPanel value={activeTab} index={1} className={classes.results}>
            { showVerses && <VersesCards verses={data.searchVerses}></VersesCards> }   
          </TabPanel>
          <TabPanel value={activeTab} index={2} className={classes.results}>
            { showPeople && <PeopleCards people={data.searchPeople}></PeopleCards> }
          </TabPanel>
          <TabPanel value={activeTab} index={3} className={classes.results}>
            { showPlaces && <PlacesCards places={data.searchPlaces}></PlacesCards> }
          </TabPanel>
      </div>
      </Container>
    );
  }

const SEARCH_QUERY = gql`
query searchResults ($input:String!) {
    searchPeople(input:$input, first:2){
        name  
        verseCount
        slug
        verses(orderBy:verseId_asc, first:1){
            verseId
            fullRef
            osisRef
        }
    }
    searchPlaces(input:$input, first:2){
        name
        verseCount
        slug
        verses(orderBy:verseId_asc, first:1){
            verseId
            fullRef
            osisRef
        }
    }              
    searchVerses(input:$input, first:10){
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
}));