import React, { useState} from 'react';
import { useQuery } from '@apollo/react-hooks';
import gql from 'graphql-tag';

import { makeStyles } from '@material-ui/core/styles';
import { Typography, Container, Paper, InputBase, IconButton, LinearProgress } from '@material-ui/core';
import { Search as SearchIcon, Cancel as CancelIcon} from '@material-ui/icons';

import SearchHints from './SearchHints';
import PeopleCards from './PeopleCards';
import PlacesCards from './PlacesCards';
import VersesCards from './VersesCards';



export default function SearchPane() {

  const classes = useStyles();
  const [searchInput, setSearch] = useState('');
  const searchUpdate = ( newInput = '' ) => {
    setSearch(newInput)
  }
  const { loading, data } = useQuery(SEARCH_QUERY, { 
    variables: { "input": searchInput },
    skip: searchInput.length < 3,
  });
    return (
      <Container maxWidth="sm">
        <Paper component="form" elevation={3} className={classes.searchBar}>
          <div className={classes.searchIcon}>
            <SearchIcon />
          </div>
          <InputBase
            className={classes.input}
            placeholder="Search the Bible"
            value={searchInput}
            inputProps={{ 'aria-label': 'Search the Bible' }}
            fullwidth={true}
            onChange={(e) => { setSearch(e.target.value) }}
          />
          {searchInput.length > 0 &&
            <IconButton 
              className={classes.iconButton}
              aria-label="clear" 
              onClick={() => { setSearch('') }} >
              <CancelIcon />
            </IconButton>
          }
        </Paper>
        <div>
          {loading && <LinearProgress color="secondary"/>}
          {searchInput.length > 2 && (!data || data.searchVerses.length === 0) && !loading &&
            <div className={classes.results}>
              <Typography>No results found.</Typography>
            </div>
          }
          <div className={classes.results}>
            {(searchInput.length <= 2 || !data || data.searchVerses.length === 0) &&
                <SearchHints searchUpdate={ searchUpdate } searchInput={ searchInput }></SearchHints>
            }
            {data && data.searchPeople.length > 0 &&
                <PeopleCards people={data.searchPeople}></PeopleCards>
            }
            {data && data.searchPlaces.length > 0 && 
                <PlacesCards places={data.searchPlaces}></PlacesCards>
            }
            {data && data.searchVerses.length > 0 && 
                <VersesCards verses={data.searchVerses}></VersesCards>
            }   
          </div>               
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
    marginTop: theme.spacing(3),
  },
}));